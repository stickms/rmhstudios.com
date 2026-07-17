/**
 * Platform-wide player leaderboards: rank users by lifetime XP (which drives
 * account level). Two scopes:
 *   - "global"  — everyone (bots excluded).
 *   - "friends" — the viewer plus the people they follow (comparison against
 *                 your own circle is far stickier than a global top-100).
 *
 * Shared by the `/api/leaderboards/players` handler and the `/leaderboard`
 * route loader so the page is server-rendered / prefetched. Reads only existing
 * data (UserProfile.xp/coins); no schema of its own.
 */

import { prisma } from '@/lib/prisma.server';
import { cached } from '@/lib/cached.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { levelFromXp } from '@/lib/xp/levels';

export type LeaderboardScope = 'global' | 'friends';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  xp: number;
  level: number;
  coins: number;
  isViewer: boolean;
  user: ReturnType<typeof resolveUser>;
}

export interface LeaderboardResult {
  scope: LeaderboardScope;
  entries: LeaderboardEntry[];
}

const LIMIT = 100;
// The global board is the same full-table `xp desc` scan for everyone, so cache
// it viewer-independently and re-stamp `isViewer` per request. The friends board
// is viewer-specific (its member set + `isViewer` depend on the viewer), so it's
// keyed by viewer with a shorter TTL.
const GLOBAL_TTL_MS = 60_000;
const FRIENDS_TTL_MS = 30_000;

/**
 * Build leaderboard entries for a `userProfile` filter. `isViewer` is computed
 * against `viewerId` (null-safe); global callers pass null here and re-stamp it
 * after the cached read so one warm copy serves every viewer.
 */
async function buildEntries(
  where: Record<string, unknown>,
  viewerId: string | null,
): Promise<LeaderboardEntry[]> {
  const rows = await prisma.userProfile.findMany({
    where: { ...where, xp: { gt: 0 } },
    orderBy: [{ xp: 'desc' }, { userId: 'asc' }],
    take: LIMIT,
    select: { userId: true, xp: true, coins: true, user: { select: userDisplaySelect } },
  });
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    xp: r.xp,
    level: levelFromXp(r.xp),
    coins: r.coins,
    isViewer: viewerId != null && r.userId === viewerId,
    user: resolveUser(r.user),
  }));
}

export async function getLeaderboard(
  viewerId: string | null,
  scope: LeaderboardScope,
): Promise<LeaderboardResult> {
  // "friends" needs a viewer; fall back to global for signed-out callers.
  const effectiveScope: LeaderboardScope = scope === 'friends' && viewerId ? 'friends' : 'global';

  if (effectiveScope === 'friends' && viewerId) {
    const entries = await cached<LeaderboardEntry[]>(
      `leaderboard:friends:${viewerId}`,
      FRIENDS_TTL_MS,
      async () => {
        const follows = await prisma.follow.findMany({
          where: { followerId: viewerId },
          select: { followingId: true },
        });
        const ids = [...new Set([viewerId, ...follows.map((f) => f.followingId)])];
        return buildEntries({ userId: { in: ids } }, viewerId);
      },
    );
    return { scope: 'friends', entries };
  }

  // Global: cache viewer-independently, then re-stamp `isViewer` for this viewer.
  const entries = await cached<LeaderboardEntry[]>(
    `leaderboard:global:${LIMIT}`,
    GLOBAL_TTL_MS,
    () => buildEntries({ user: { isBot: false } }, null),
  );
  return {
    scope: 'global',
    entries: viewerId
      ? entries.map((e) => (e.userId === viewerId ? { ...e, isViewer: true } : e))
      : entries,
  };
}
