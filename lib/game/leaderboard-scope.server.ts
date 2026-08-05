/**
 * Who is on the board — the audience half of a leaderboard read.
 *
 * A global top-25 is the least interesting board a game can show: after the
 * first week nobody signed in this month is on it, and the page stops being a
 * reason to come back. The interesting boards are the small ones — your
 * friends, your community — which is exactly where the security questions
 * appear, because narrowing a board by a relationship means answering "may this
 * viewer see that relationship?" on every request.
 *
 * Putting that answer here rather than in the route is the point. A scope is a
 * membership question with a wrong answer that leaks (a community board handed
 * to a non-member enumerates its members and their activity), and a route is
 * the worst place for a check that has to be identical everywhere.
 *
 * Each scope resolves to ONE audience list, from which both output shapes are
 * derived:
 *   - `where`    — a `GameStat` where-fragment, for games on the shared table.
 *   - `audience` — the same ids, for the bespoke tables. The `GameAdapter`
 *                  interface takes a row count and nothing else (each bespoke
 *                  game has a different model, so there is no where-fragment
 *                  they could share), so a caller reading one of those narrows
 *                  in memory instead. One source, two shapes, no chance of the
 *                  two disagreeing about who is allowed on the board.
 *
 * `null` audience means unrestricted — not "empty".
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { getFollowingIds } from '@/lib/social/follow-graph.server';
import { getRole } from '@/lib/communities/access.server';

export const LEADERBOARD_SCOPES = ['global', 'friends', 'community', 'country'] as const;
export type LeaderboardScope = (typeof LEADERBOARD_SCOPES)[number];

export const LEADERBOARD_WINDOWS = ['all', 'season', 'month', 'week', 'day'] as const;
export type LeaderboardWindow = (typeof LEADERBOARD_WINDOWS)[number];

/**
 * Cap on the resolved audience, mirroring `FOLLOWING_ID_CAP` in
 * `lib/social/follow-graph.server.ts`. An `IN (...)` list is planned and bound
 * on every request; a community with 50k members would ship 50k literals into
 * a query whose answer is 25 rows. Beyond this the board is a sample of the
 * audience rather than all of it, which is a better failure than a timeout.
 */
const AUDIENCE_CAP = 5_000;

export interface ScopeOptions {
  /** Required by `scope: 'community'`; ignored by every other scope. */
  communityId?: string | null;
}

/**
 * A refusal carries the status the route should send, because the reasons are
 * genuinely different responses: an unbuildable scope is a 400 (the request
 * asked for something this deployment cannot answer), a signed-out viewer
 * reaching for a members-only board is a 401 (signing in is the next step), and
 * a signed-in non-member is a 403 (nothing they can do about it).
 */
export type ScopeFilterResult =
  | {
      supported: true;
      /** Where-fragment for `prisma.gameStat` reads (empty object = unrestricted). */
      where: Prisma.GameStatWhereInput;
      /** Resolved user ids, or `null` for "everyone". */
      audience: string[] | null;
    }
  | { supported: false; status: 400 | 401 | 403; reason: string };

/** Turn a resolved audience into both output shapes. */
function audience(ids: string[] | null): ScopeFilterResult {
  return {
    supported: true,
    where: ids === null ? {} : { userId: { in: ids } },
    audience: ids,
  };
}

/**
 * Resolve a scope to the set of players allowed on the board.
 *
 * Signed-out callers are handled per scope rather than uniformly: a `friends`
 * board with no viewer is a legitimate, well-defined request whose answer
 * happens to be empty (the page renders "sign in to compare with friends"),
 * while a `community` board with no viewer is a members-only surface being
 * requested by a non-member and has to be refused.
 */
export async function scopeFilter(
  scope: LeaderboardScope,
  viewerId: string | null,
  opts: ScopeOptions = {},
): Promise<ScopeFilterResult> {
  switch (scope) {
    case 'global':
      return audience(null);

    case 'friends': {
      // Empty, not an error: an anonymous viewer has no friends to compare
      // against, and 401-ing a read that a signed-out visitor can reasonably
      // land on (a shared link, a back button) turns a blank list into a
      // dead end.
      if (!viewerId) return audience([]);

      // Mutual follows only. A one-way follow list would let anyone put
      // themselves on a stranger's "friends" board by following them, and the
      // whole appeal of the scope is that it is a board of people you know.
      // (`lib/leaderboard.server.ts` scopes its XP board to one-way follows;
      // that is a different, older surface and is deliberately not changed
      // here.)
      const following = await getFollowingIds(viewerId);
      if (following.length === 0) return audience([viewerId]);

      // Same shape as `getActiveFriends` in `lib/presence.server.ts`: ask for
      // the back-edges of the follow list rather than loading both directions
      // and intersecting in memory. Indexed on `(followerId, followingId)`.
      const backEdges = await prisma.follow.findMany({
        where: { followerId: { in: following }, followingId: viewerId },
        select: { followerId: true },
        take: AUDIENCE_CAP,
      });

      // The viewer is always on their own friends board — a ranking that hides
      // where you stand answers the wrong question.
      return audience([viewerId, ...backEdges.map((f) => f.followerId)]);
    }

    case 'community': {
      const communityId = opts.communityId?.trim();
      if (!communityId) {
        return {
          supported: false,
          status: 400,
          reason: 'A community leaderboard needs a communityId.',
        };
      }
      if (!viewerId) {
        return {
          supported: false,
          status: 401,
          reason: 'Sign in to see a community leaderboard.',
        };
      }

      // Membership is checked BEFORE the member list is read, so a non-member
      // never receives one. The board is a roster: it names everyone who has
      // played and how often they play, which is exactly the information a
      // private community exists to keep inside itself. The check is uniform
      // over public and private communities — a board that leaked only for
      // public ones would be a rule nobody could remember correctly.
      const role = await getRole(communityId, viewerId);
      if (!role) {
        return {
          supported: false,
          status: 403,
          reason: 'Join this community to see its leaderboard.',
        };
      }

      const members = await prisma.communityMember.findMany({
        where: { communityId },
        select: { userId: true },
        // Oldest members first, so the sample stays stable between requests
        // instead of reshuffling whenever somebody joins.
        orderBy: { joinedAt: 'asc' },
        take: AUDIENCE_CAP,
      });
      return audience(members.map((m) => m.userId));
    }

    case 'country':
      // Deliberately unbuilt rather than approximated. There is no country on
      // the user record, and every way of inventing one is worse than not
      // having it: request-time geo-IP labels a player by where they happen to
      // be sitting (and pins VPN users to a random country), and a locale or
      // timezone guess is a language and an offset, not a nationality. A
      // country board is a fine feature — it needs a column the player
      // controls, and until that exists this has to be a clear refusal instead
      // of a board that is quietly wrong about where people are from.
      return {
        supported: false,
        status: 400,
        reason:
          'Country leaderboards are not available: accounts have no country. ' +
          'Add a user-set country field before enabling this scope.',
      };
  }
}

export type WindowFilterResult =
  | { supported: true; where: Prisma.GameStatWhereInput }
  | { supported: false; status: 400; reason: string };

/**
 * Resolve a time window — currently only `all`.
 *
 * The refusal is the honest answer, not a stub. Every table behind these boards
 * (the shared `GameStat` and each bespoke `*Player`) holds ONE rolling row per
 * player carrying their all-time best; there is no per-run history anywhere. A
 * `week` filter on those rows can only mean "players who submitted something
 * this week", and the score next to their name would still be their all-time
 * best. Shipping that under a "This week" heading is not a rough answer, it is
 * a wrong one — the board would be topped by a veteran who logged in on Tuesday
 * rather than by whoever actually played best this week.
 *
 * Answering it properly needs an append-only run table (one row per submitted
 * run, `MAX(score)` grouped by player over the window). When that exists, this
 * function grows the other branches and nothing above it changes. `season` is
 * blocked for the same reason plus a second one: `lib/battlepass/season.ts`
 * declares `endsAt` and no start date, so there is no boundary to filter on.
 */
export function windowFilter(window: LeaderboardWindow): WindowFilterResult {
  if (window === 'all') return { supported: true, where: {} };
  return {
    supported: false,
    status: 400,
    reason:
      `The "${window}" leaderboard window is not available: scores are stored as one ` +
      'rolling personal best per player, with no per-run history to window over. ' +
      'Use window=all.',
  };
}
