/**
 * Handle changes with a paper trail (J2) — the database half of
 * `lib/handles/history.ts`.
 *
 * `changeHandle` is the guarded path: cooldown, reclaim block, uniqueness and
 * the `HandleChange` row all happen together, in one transaction, so a change
 * cannot land without its record.
 *
 * `PATCH /api/profile` delegates here too, so the J2 rules hold on the profile form as well as on
 * `POST /api/handles/change`.
 */

import { prisma } from '@/lib/prisma.server';
import { refusalBody, type ErrorCode } from '@/lib/errors/codes';
import { isDeletedAccount } from '@/lib/account-lifecycle';
import { handleSchema } from '@/lib/handle-schema';
import { invalidateProfileLookup } from '@/lib/profile.server';
import { invalidateUserDisplay } from '@/lib/user-display.server';
import { recordSecurityEvent } from '@/lib/auth/security-log.server';
import {
  PREVIOUS_HANDLE_WINDOW_MS,
  canChangeHandleNow,
  handleChangeCooldownRemaining,
  isHandleReclaimBlocked,
  previousHandles,
  reclaimBlockRemaining,
  type HandleChangeRecord,
  type PreviousHandle,
} from '@/lib/handles/history';

export type HandleChangeFailure =
  'invalid' | 'unchanged' | 'cooldown' | 'reclaim-blocked' | 'taken' | 'no-account';

export type HandleChangeResult =
  | { ok: true; oldHandle: string; newHandle: string }
  | { ok: false; reason: HandleChangeFailure; retryAfterMs?: number; message: string };

/** Every release of `handle` by anyone, newest first. */
async function releasesOf(handle: string): Promise<HandleChangeRecord[]> {
  const rows = await prisma.handleChange.findMany({
    where: { oldHandle: handle },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { userId: true, oldHandle: true, newHandle: true, createdAt: true },
  });
  return rows;
}

/** The body of a refused handle change: the English `message` as `error`, plus the taxonomy `code` it was minted for. */
export function handleRefusalBody(result: Extract<HandleChangeResult, { ok: false }>): { error: string; code?: ErrorCode } {
  switch (result.reason) {
    case 'no-account':
      return refusalBody('ACCOUNT_NOT_FOUND');
    case 'unchanged':
      return refusalBody('HANDLE_UNCHANGED');
    case 'cooldown':
      return refusalBody('HANDLE_COOLDOWN');
    case 'reclaim-blocked':
      return refusalBody('HANDLE_RECLAIM_BLOCKED');
    case 'taken':
      return refusalBody('HANDLE_TAKEN');
    default:
      return { error: result.message };
  }
}

/**
 * Change a handle, recording it.
 *
 * The reclaim block is checked against `HandleChange`, not against the `user`
 * table, because the whole point is that the previous owner no longer holds the
 * name: after `alice → alice2`, `alice` is free as far as the unique index is
 * concerned, and the 30-day freeze is the only thing standing between that and
 * a takeover.
 */
export async function changeHandle(
  userId: string,
  requested: string,
  options: { isAdmin?: boolean; now?: Date } = {},
): Promise<HandleChangeResult> {
  const { isAdmin = false, now = new Date() } = options;

  const parsed = handleSchema.safeParse(requested.trim().toLowerCase());
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'invalid',
      message: parsed.error.issues[0]?.message ?? 'Invalid handle',
    };
  }
  const next = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { handle: true, handleChangedAt: true },
  });
  if (!user) return { ok: false, reason: 'no-account', message: 'Account not found' };
  if (user.handle === next) {
    return { ok: false, reason: 'unchanged', message: 'That is already your handle' };
  }

  if (!canChangeHandleNow(user.handleChangedAt, isAdmin, now)) {
    return {
      ok: false,
      reason: 'cooldown',
      retryAfterMs: handleChangeCooldownRemaining(user.handleChangedAt, now),
      message: 'You can only change your handle once every 30 days',
    };
  }

  // Admins are NOT exempt from the reclaim block: it protects a third party
  // (the person who released the name), not the person doing the renaming.
  const releases = await releasesOf(next);
  if (isHandleReclaimBlocked(releases, next, { claimantId: userId, now })) {
    return {
      ok: false,
      reason: 'reclaim-blocked',
      retryAfterMs: reclaimBlockRemaining(releases, next, { claimantId: userId, now }),
      message: 'That handle was released recently and is not available yet',
    };
  }

  const previousHandle = user.handle;

  try {
    await prisma.$transaction(async (tx) => {
      const taken = await tx.user.findUnique({ where: { handle: next }, select: { id: true } });
      if (taken && taken.id !== userId) throw new HandleTakenError();

      await tx.user.update({
        where: { id: userId },
        data: { handle: next, handleChangedAt: now },
      });
      // An account that never had a handle is not a *change* — there is no
      // former identity to record, and writing `oldHandle: ''` would put an
      // empty string into the reclaim index.
      if (previousHandle) {
        await tx.handleChange.create({
          data: { userId, oldHandle: previousHandle, newHandle: next },
        });
      }
    });
  } catch (error) {
    if (error instanceof HandleTakenError) {
      return { ok: false, reason: 'taken', message: 'This handle is already taken' };
    }
    // Unique-constraint race on `user.handle` — same user-visible outcome.
    if (typeof error === 'object' && error && (error as { code?: string }).code === 'P2002') {
      return { ok: false, reason: 'taken', message: 'This handle is already taken' };
    }
    throw error;
  }

  // After the transaction has committed, so a rolled-back change leaves no row. Only a rename counts:
  // giving an account its first handle has no old name to report.
  if (previousHandle) {
    void recordSecurityEvent({
      userId,
      kind: 'handle_changed',
      detail: { oldHandle: previousHandle, newHandle: next },
    });
  }

  invalidateUserDisplay(userId);
  // A handle nobody held a moment ago may well have been looked up (and its
  // absence cached) in that moment — a name being claimed is exactly the traffic
  // pattern that precedes claiming it. Drop the negative entry so `/@next`
  // resolves on the first request after the rename (OPT-47).
  invalidateProfileLookup(next);
  return { ok: true, oldHandle: previousHandle ?? '', newHandle: next };
}

class HandleTakenError extends Error {
  constructor() {
    super('handle taken');
    this.name = 'HandleTakenError';
  }
}

/** A user's full change history, newest first (their own settings view). */
export async function getHandleHistory(userId: string, limit = 20): Promise<HandleChangeRecord[]> {
  return prisma.handleChange.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { userId: true, oldHandle: true, newHandle: true, createdAt: true },
  });
}

/**
 * "Previously known as" for a profile — former handles inside the 30-day
 * window, newest first.
 *
 * Public by design: it is the cheap defence against the handoff play, and it is
 * only useful if a visitor can see it. Intended for the profile header (a
 * one-line render next to `@handle`); `GET /api/handles/history?handle=` serves
 * it until the profile route reads it directly.
 */
export async function getPreviouslyKnownAs(
  userId: string,
  options: { currentHandle?: string | null; now?: Date } = {},
): Promise<PreviousHandle[]> {
  // A deleted profile shows only its tombstone header; rows kept for the reclaim block are never shown (s10-19).
  const account = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, banReason: true } });
  if (account && isDeletedAccount(account)) return [];
  // Pre-filter in SQL with the same window `previousHandles` applies, so the
  // query and the pure filter can never drift apart.
  const cutoff = new Date((options.now ?? new Date()).getTime() - PREVIOUS_HANDLE_WINDOW_MS);
  const rows = await prisma.handleChange.findMany({
    where: { userId, createdAt: { gte: cutoff } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { userId: true, oldHandle: true, newHandle: true, createdAt: true },
  });
  return previousHandles(rows, options);
}
