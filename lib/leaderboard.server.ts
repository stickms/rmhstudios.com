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

import { prismaRead } from '@/lib/prisma.server';
import { getFollowingIds, friendsLeaderboardKey } from '@/lib/social/follow-graph.server';
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
  /**
   * The viewer and up to {@link NEARBY_SPAN} players either side of them, when
   * the viewer is ranked but outside the global top {@link LIMIT}. Social
   * comparison (Festinger, 1954) motivates against people close to you; a
   * top-100 you are nowhere near only discourages (Marsh's big-fish-little-pond
   * effect). `null` for the friends board, signed-out viewers, and viewers who
   * already appear in `entries`.
   */
  nearby: LeaderboardEntry[] | null;
}

const LIMIT = 100;

/** Players shown above and below the viewer in the `nearby` slice. */
export const NEARBY_SPAN = 2;
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
  // Leaderboards tolerate replica lag (they are already cached 30-60 s).
  const rows = await prismaRead.userProfile.findMany({
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
    coins: Number(r.coins),
    isViewer: viewerId != null && r.userId === viewerId,
    user: resolveUser(r.user),
  }));
}

const NEARBY_TTL_MS = 30_000;

/**
 * The viewer's global rank and the {@link NEARBY_SPAN} players on each side,
 * in the same `xp desc, userId asc` order as {@link buildEntries}. Three small
 * indexed reads (a count and two `take: NEARBY_SPAN` scans), cached per viewer.
 */
async function buildNearby(
  viewerId: string,
): Promise<LeaderboardEntry[] | null> {
  const me = await prismaRead.userProfile.findUnique({
    where: { userId: viewerId },
    select: { xp: true },
  });
  if (!me || me.xp <= 0) return null;
  const human = { user: { isBot: false } };
  const ahead = {
    ...human,
    OR: [{ xp: { gt: me.xp } }, { xp: me.xp, userId: { lt: viewerId } }],
  };
  const behind = {
    ...human,
    OR: [
      { xp: { lt: me.xp, gt: 0 } },
      { xp: me.xp, userId: { gt: viewerId } },
    ],
  };
  const select = {
    userId: true,
    xp: true,
    coins: true,
    user: { select: userDisplaySelect },
  } as const;
  const [aheadCount, above, self, below] = await Promise.all([
    prismaRead.userProfile.count({ where: ahead }),
    prismaRead.userProfile.findMany({
      where: ahead,
      orderBy: [{ xp: 'asc' }, { userId: 'desc' }],
      take: NEARBY_SPAN,
      select,
    }),
    prismaRead.userProfile.findUnique({ where: { userId: viewerId }, select }),
    prismaRead.userProfile.findMany({
      where: behind,
      orderBy: [{ xp: 'desc' }, { userId: 'asc' }],
      take: NEARBY_SPAN,
      select,
    }),
  ]);
  if (!self) return null;
  const rows = [...above.reverse(), self, ...below];
  const firstRank = aheadCount + 1 - above.length;
  return rows.map((r, i) => ({
    rank: firstRank + i,
    userId: r.userId,
    xp: r.xp,
    level: levelFromXp(r.xp),
    coins: Number(r.coins),
    isViewer: r.userId === viewerId,
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
      friendsLeaderboardKey(viewerId),
      FRIENDS_TTL_MS,
      async () => {
        // The shared, capped (5,000 most recent) follow list, already cached and
        // invalidated on follow/unfollow (which also drops this board). The cap is
        // kept on purpose: this board ranks people, it gates no visibility, and
        // beyond 5,000 follows the oldest follows simply drop off a top-N list.
        const following = await getFollowingIds(viewerId);
        const ids = [...new Set([viewerId, ...following])];
        return buildEntries({ userId: { in: ids } }, viewerId);
      },
    );
    return { scope: 'friends', entries, nearby: null };
  }

  // Global: cache viewer-independently, then re-stamp `isViewer` for this viewer.
  const entries = await cached<LeaderboardEntry[]>(
    `leaderboard:global:${LIMIT}`,
    GLOBAL_TTL_MS,
    () => buildEntries({ user: { isBot: false } }, null),
  );
  const viewerListed =
    viewerId != null && entries.some((e) => e.userId === viewerId);
  const nearby =
    viewerId && !viewerListed
      ? await cached<LeaderboardEntry[] | null>(
          `leaderboard:nearby:${viewerId}`,
          NEARBY_TTL_MS,
          () => buildNearby(viewerId),
        )
      : null;
  return {
    scope: 'global',
    entries: viewerId
      ? entries.map((e) => (e.userId === viewerId ? { ...e, isViewer: true } : e))
      : entries,
    nearby,
  };
}
