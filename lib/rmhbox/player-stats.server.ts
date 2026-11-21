/**
 * RMHBox player stats: who may see a record, and the record itself.
 *
 * A member's RMHBox record follows their existing game-activity setting
 * (`User.playtimePrivacy`, `canViewPlaytime`), so there is no second privacy
 * switch. `resolveStatsAccess` is the one decision; the stats endpoint, the
 * history endpoint's player filter and the page loader (which runs the endpoint
 * in-process) all go through it.
 *
 * Blocks in either direction and a ban on either side read as "no such player",
 * never as "private", so a probe cannot tell them from an unknown id.
 */
import { prisma } from '@/lib/prisma.server';
import { canViewPlaytime, isPlaytimePrivacy, type PlaytimePrivacy } from '@/lib/playtime/privacy';
import { isBlockedPair } from '@/lib/messages/send.server';
import { resolveUserDisplay, userDisplaySelect } from '@/lib/user-display';
import {
  deriveGlobal,
  normalizeMinigameStats,
  toRecentMatch,
  type GlobalStats,
  type MinigameStats,
  type RecentMatch,
} from '@/lib/rmhbox/player-stats';
import { STATS_PAGE_DEFAULT } from '@/lib/rmhbox/player-stats-schema';

/**
 * `full`: the whole record. `totals`: only the headline numbers (a signed-out
 * visitor to a public record). `private`: the owner's setting keeps it from this
 * viewer. `none`: no such player as far as this viewer can tell.
 */
export type StatsAccess = 'full' | 'totals' | 'private' | 'none';

export interface StatsSubject {
  id: string;
  name: string;
  image: string | null;
  privacy: PlaytimePrivacy;
}

export interface StatsDecision {
  access: StatsAccess;
  /** Present for every access except `none`. */
  subject: StatsSubject | null;
}

const NONE: StatsDecision = { access: 'none', subject: null };

function banned(until: Date | null | undefined, now: Date): boolean {
  return !!until && until.getTime() > now.getTime();
}

/** Decide what `viewerId` (null when signed out) may see of `subjectId`'s record. */
export async function resolveStatsAccess(
  viewerId: string | null,
  subjectId: string,
  now: Date = new Date(),
): Promise<StatsDecision> {
  const subject = await prisma.user.findUnique({
    where: { id: subjectId },
    select: { ...userDisplaySelect, playtimePrivacy: true, bannedUntil: true },
  });
  if (!subject || banned(subject.bannedUntil, now)) return NONE;

  const privacy: PlaytimePrivacy = isPlaytimePrivacy(subject.playtimePrivacy)
    ? subject.playtimePrivacy
    : 'private';
  const display = resolveUserDisplay(subject);
  const view: StatsSubject = {
    id: subject.id,
    name: display.name ?? subject.handle ?? '',
    image: display.image ?? null,
    privacy,
  };

  if (!viewerId) {
    return privacy === 'public' ? { access: 'totals', subject: view } : { access: 'private', subject: view };
  }
  if (viewerId === subjectId) return { access: 'full', subject: view };

  const viewer = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { bannedUntil: true },
  });
  if (!viewer || banned(viewer.bannedUntil, now)) return NONE;
  if (await isBlockedPair(viewerId, subjectId)) return NONE;

  let follows = false;
  if (privacy === 'followers') {
    const row = await prisma.follow.findFirst({
      where: { followerId: viewerId, followingId: subjectId },
      select: { id: true },
    });
    follows = !!row;
  }
  const allowed = canViewPlaytime(privacy, { viewerId, ownerId: subjectId, viewerFollowsOwner: follows });
  return { access: allowed ? 'full' : 'private', subject: view };
}

export interface PlayerStats {
  global: GlobalStats | null;
  minigames: Record<string, MinigameStats>;
  recentMatches: RecentMatch[];
}

/**
 * One profile read and one indexed `findMany` for the recent matches. A member
 * with no profile has no record (`global: null`).
 */
export async function getPlayerStats(
  userId: string,
  opts: { minigame?: string | undefined; limit?: number | undefined; offset?: number | undefined; withMatches: boolean },
): Promise<PlayerStats> {
  const profile = await prisma.rMHboxProfile.findUnique({ where: { userId } });
  if (!profile) return { global: null, minigames: {}, recentMatches: [] };

  const minigames = normalizeMinigameStats(profile.minigameStats);
  const global = deriveGlobal(profile, minigames);
  if (!opts.withMatches) return { global, minigames: {}, recentMatches: [] };

  const rows = await prisma.rMHboxMatchPlayer.findMany({
    where: {
      userId,
      ...(opts.minigame ? { match: { minigameId: opts.minigame } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    skip: opts.offset ?? 0,
    take: opts.limit ?? STATS_PAGE_DEFAULT,
    select: {
      rank: true,
      score: true,
      wasWinner: true,
      match: {
        select: { id: true, minigameId: true, startedAt: true, durationMs: true, playerCount: true },
      },
    },
  });
  return { global, minigames, recentMatches: rows.map(toRecentMatch) };
}
