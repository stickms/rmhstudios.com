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

export async function getLeaderboard(
  viewerId: string | null,
  scope: LeaderboardScope,
): Promise<LeaderboardResult> {
  // "friends" needs a viewer; fall back to global for signed-out callers.
  const effectiveScope: LeaderboardScope = scope === 'friends' && viewerId ? 'friends' : 'global';

  let userFilter: Record<string, unknown> = { user: { isBot: false } };
  if (effectiveScope === 'friends' && viewerId) {
    const follows = await prisma.follow.findMany({
      where: { followerId: viewerId },
      select: { followingId: true },
    });
    const ids = [...new Set([viewerId, ...follows.map((f) => f.followingId)])];
    userFilter = { userId: { in: ids } };
  }

  const rows = await prisma.userProfile.findMany({
    where: { ...userFilter, xp: { gt: 0 } },
    orderBy: [{ xp: 'desc' }, { userId: 'asc' }],
    take: LIMIT,
    select: { userId: true, xp: true, coins: true, user: { select: userDisplaySelect } },
  });

  return {
    scope: effectiveScope,
    entries: rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      xp: r.xp,
      level: levelFromXp(r.xp),
      coins: r.coins,
      isViewer: r.userId === viewerId,
      user: resolveUser(r.user),
    })),
  };
}
