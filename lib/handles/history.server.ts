/**
 * Handle changes with a paper trail (J2) — the database half of
 * `lib/handles/history.ts`.
 *
 * `changeHandle` is the guarded path: cooldown, reclaim block, uniqueness and
 * the `HandleChange` row all happen together, in one transaction, so a change
 * cannot land without its record.
 *
 * NOTE for whoever owns `app/routes/api/profile.ts`: that route still changes
 * handles directly (14-day cooldown, no history row, no reclaim block). It
 * should delegate to `changeHandle` here — until it does, the J2 rules are only
 * enforced on `POST /api/handles/change`.
 */

import { prisma } from '@/lib/prisma.server';
import { handleSchema } from '@/lib/handle';
import { invalidateUserDisplay } from '@/lib/user-display.server';
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

  invalidateUserDisplay(userId);
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
