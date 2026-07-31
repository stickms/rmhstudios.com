/**
 * Account standing — the read model behind `/settings/account-status` and the
 * shared definition of what counts as an *active* strike.
 *
 * One rule matters more than the rest here: an OVERTURNED strike is void. It
 * must not appear in the active count, which means it must not push a user
 * toward (or hold them at) the three-strike auto-ban. Every caller that counts
 * strikes goes through `activeStrikeWhere` so that rule can never be
 * re-implemented slightly differently in a second place — which is exactly how
 * the ban threshold would silently drift.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';

/** Strike levels a user can be at, derived from the active strike count. */
export type StandingLevel = 'GOOD' | 'WARNED' | 'AT_RISK' | 'RESTRICTED';

/** Active strikes needed for the automatic ban (mirrors the strike endpoint). */
export const AUTO_BAN_THRESHOLD = 3;

/** Appeal window: a strike can only be contested this soon after issue. */
export const APPEAL_WINDOW_DAYS = 30;

/**
 * Prisma `where` fragment for strikes that still count against a user:
 * unexpired AND not overturned on appeal.
 */
export function activeStrikeWhere(userId: string, now = new Date()): Prisma.UserStrikeWhereInput {
  return {
    userId,
    appealStatus: { not: 'OVERTURNED' },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

/** Count the strikes currently counting against a user. */
export function countActiveStrikes(userId: string, now = new Date()): Promise<number> {
  return prisma.userStrike.count({ where: activeStrikeWhere(userId, now) });
}

function levelFor(activeCount: number, banned: boolean): StandingLevel {
  if (banned) return 'RESTRICTED';
  if (activeCount >= AUTO_BAN_THRESHOLD) return 'RESTRICTED';
  if (activeCount === AUTO_BAN_THRESHOLD - 1) return 'AT_RISK';
  if (activeCount > 0) return 'WARNED';
  return 'GOOD';
}

/** A single strike as the owning user sees it. */
export interface StandingStrike {
  id: string;
  reason: string;
  createdAt: string;
  expiresAt: string | null;
  /** Still counting against the account (unexpired + not overturned). */
  active: boolean;
  entityType: string | null;
  entityId: string | null;
  appealStatus: 'NONE' | 'PENDING' | 'UPHELD' | 'OVERTURNED';
  appealText: string | null;
  appealedAt: string | null;
  /** Moderator's note on the decision, surfaced to the user verbatim. */
  appealNote: string | null;
  decidedAt: string | null;
  /** False once the window has closed or an appeal already exists. */
  canAppeal: boolean;
}

export interface AccountStanding {
  level: StandingLevel;
  activeStrikes: number;
  totalStrikes: number;
  autoBanThreshold: number;
  appealWindowDays: number;
  banned: boolean;
  bannedUntil: string | null;
  banReason: string | null;
  strikes: StandingStrike[];
}

/**
 * Whether `strike` can still be appealed: no appeal filed yet and inside the
 * window. Expired strikes stay appealable — the record outlives the penalty and
 * users reasonably want it cleared.
 */
function appealable(strike: { createdAt: Date; appealStatus: string }, now: number): boolean {
  if (strike.appealStatus !== 'NONE') return false;
  return now - strike.createdAt.getTime() <= APPEAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Build the full standing view for one user. Also stamps `acknowledgedAt` on
 * any strike the user is seeing for the first time, so moderators can
 * distinguish "we notified them" from "they read it" — best-effort, a failure
 * here must not blank the page.
 */
export async function getAccountStanding(userId: string): Promise<AccountStanding> {
  const nowDate = new Date();
  const now = nowDate.getTime();

  const [user, strikes] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { bannedUntil: true, banReason: true },
    }),
    prisma.userStrike.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        reason: true,
        createdAt: true,
        expiresAt: true,
        entityType: true,
        entityId: true,
        acknowledgedAt: true,
        appealStatus: true,
        appealText: true,
        appealedAt: true,
        appealNote: true,
        decidedAt: true,
      },
    }),
  ]);

  const banned = !!user?.bannedUntil && user.bannedUntil.getTime() > now;

  const mapped: StandingStrike[] = strikes.map((s) => {
    const expired = !!s.expiresAt && s.expiresAt.getTime() <= now;
    return {
      id: s.id,
      reason: s.reason,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt?.toISOString() ?? null,
      active: !expired && s.appealStatus !== 'OVERTURNED',
      entityType: s.entityType,
      entityId: s.entityId,
      appealStatus: s.appealStatus,
      appealText: s.appealText,
      appealedAt: s.appealedAt?.toISOString() ?? null,
      appealNote: s.appealNote,
      decidedAt: s.decidedAt?.toISOString() ?? null,
      canAppeal: appealable(s, now),
    };
  });

  const unseen = strikes.filter((s) => !s.acknowledgedAt).map((s) => s.id);
  if (unseen.length > 0) {
    await prisma.userStrike
      .updateMany({ where: { id: { in: unseen } }, data: { acknowledgedAt: nowDate } })
      .catch(() => {});
  }

  const activeStrikes = mapped.filter((s) => s.active).length;

  return {
    level: levelFor(activeStrikes, banned),
    activeStrikes,
    totalStrikes: mapped.length,
    autoBanThreshold: AUTO_BAN_THRESHOLD,
    appealWindowDays: APPEAL_WINDOW_DAYS,
    banned,
    bannedUntil: banned ? (user?.bannedUntil?.toISOString() ?? null) : null,
    banReason: banned ? (user?.banReason ?? null) : null,
    strikes: mapped,
  };
}
