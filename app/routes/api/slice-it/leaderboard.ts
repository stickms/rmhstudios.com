import { createFileRoute } from '@tanstack/react-router';
import type { Prisma } from '@prisma/client';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { LEADERBOARD_WINDOW_DAYS, LeaderboardQueryZ } from '@/lib/slice-it/api-schemas';
import type { LeaderboardQuery } from '@/lib/slice-it/api-schemas';
import { toModPool } from '@/lib/slice-it/pools';
import type { Difficulty } from '@/lib/slice-it/constants';
import type { LeaderboardEntry, Modifiers } from '@/lib/slice-it/types';

/**
 * Leaderboards — per song, or the global career board.
 *
 * ## What changed
 *
 * - **It leaked.** The 500 path returned `e.message` whenever `NODE_ENV` was
 *   not exactly `'production'`, which includes every environment that forgets
 *   to set it. It also `console.log`ged the full result set on every successful
 *   request, at read volume.
 * - **Top ten, forever.** `take: 10` with no cursor, so eleventh place did not
 *   exist as far as the API was concerned — including to the player in it.
 * - **No self row.** A player outside the top ten had no way to see their own
 *   standing, which is the single thing a leaderboard is for once you are not
 *   winning. `self` is returned alongside the page.
 *
 * ## Boards, scopes and windows (R1, R5)
 *
 * A song's board is now addressed by `(songId, difficulty, modPool)` rather than
 * by song alone — see the note on `SongLeaderboard` in the schema for why one
 * row per player per song was a correctness bug and not merely a coarse ranking.
 * Both are optional here: omitting them merges every tier and pool, which is
 * exactly the old response, so a client that has not been updated sees no
 * change in shape or content.
 *
 * On top of that, `scope` narrows the *population* (everyone / accounts you
 * follow / accounts sharing your location) and `window` narrows the *age* of the
 * best. Neither is a different query — both are `where` fragments on the same
 * indexed read, and the cursor paging and self-row logic are untouched.
 *
 * ## What the rows carry (X11)
 *
 * Every entry now carries `handle`, so every row can link to a player page.
 * It is null for an account that has none — and the UI branches on that null
 * rather than constructing a URL from `username`, which is display text, is not
 * unique, and changes whenever its owner changes it.
 */
export const Route = createFileRoute('/api/slice-it/leaderboard')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', query: LeaderboardQueryZ, rateLimit: 'read' },
        async ({ query, userId }) => {
          const { songId, cursor, limit, difficulty, modPool } = query;

          if (songId) {
            const audience = await resolveAudience(query, userId);
            if (audience.unavailable) {
              // The caller asked for a population we cannot name for them —
              // `friends` while signed out, `country` with no location set. An
              // empty board plus the reason beats silently answering with the
              // global one, which looks identical to a working country board
              // and is not one.
              return Response.json({
                entries: [],
                total: 0,
                nextCursor: null,
                self: null,
                scopeUnavailable: audience.unavailable,
              });
            }

            const where: Prisma.SongLeaderboardWhereInput = {
              songId,
              ...(difficulty ? { difficulty } : {}),
              ...(modPool ? { modPool } : {}),
              ...windowFilter(query.window),
              ...audience.where,
            };

            const [rows, total] = await Promise.all([
              prisma.songLeaderboard.findMany({
                where,
                orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
                skip: cursor,
                take: limit,
                select: BOARD_SELECT,
              }),
              prisma.songLeaderboard.count({ where }),
            ]);

            const entries: LeaderboardEntry[] = rows.map((row, index) =>
              toEntry(row, cursor + index + 1, userId),
            );

            return Response.json({
              entries,
              total,
              nextCursor: cursor + rows.length < total ? cursor + rows.length : null,
              self: userId ? await selfSongRank(songId, userId, query) : null,
            });
          }

          // Global career board — total score across every song.
          const [rows, total] = await Promise.all([
            prisma.player.findMany({
              where: { totalScore: { gt: 0 } },
              orderBy: [{ totalScore: 'desc' }, { id: 'asc' }],
              skip: cursor,
              take: limit,
              select: {
                userId: true,
                username: true,
                totalScore: true,
                gamesPlayed: true,
                user: { select: userDisplaySelect },
              },
            }),
            prisma.player.count({ where: { totalScore: { gt: 0 } } }),
          ]);

          const entries: LeaderboardEntry[] = rows.map((row, index) => {
            const display = row.user ? resolveUser(row.user) : null;
            return {
              rank: cursor + index + 1,
              userId: row.userId ?? '',
              username: display?.name || row.username,
              handle: display?.handle ?? null,
              image: display?.image ?? null,
              score: row.totalScore,
              maxCombo: 0,
              accuracy: null,
              speedMod: 1,
              modifiers: null,
              achievedAt: new Date(0).toISOString(),
              isSelf: Boolean(userId) && row.userId === userId,
            };
          });

          return Response.json({
            entries,
            total,
            nextCursor: cursor + rows.length < total ? cursor + rows.length : null,
            self: userId ? await selfGlobalRank(userId) : null,
          });
        },
      ),
    },
  },
});

/**
 * The columns a board row is built from.
 *
 * Declared once and shared by the page read and the self-row read, because the
 * two were drifting — the self row was always one field behind whatever the page
 * had most recently gained. Note what is absent: anything off the `chart`
 * relation. A board needs to know that a chart *changed* (the hash), never the
 * notes themselves, and selecting a relation "because it is there" is how a
 * hundred-kilobyte blob ends up in a paginated list response.
 */
const BOARD_SELECT = {
  userId: true,
  score: true,
  maxCombo: true,
  accuracy: true,
  speedMod: true,
  modifiers: true,
  difficulty: true,
  modPool: true,
  isFullCombo: true,
  isPerfect: true,
  createdAt: true,
  user: { select: userDisplaySelect },
} as const satisfies Prisma.SongLeaderboardSelect;

type BoardRow = Prisma.SongLeaderboardGetPayload<{ select: typeof BOARD_SELECT }>;

function toEntry(row: BoardRow, rank: number, viewerId: string | null): LeaderboardEntry {
  const display = resolveUser(row.user);
  return {
    rank,
    userId: row.userId,
    username: display.name || display.username || 'Unknown',
    handle: display.handle,
    image: display.image ?? null,
    score: row.score,
    maxCombo: row.maxCombo,
    accuracy: row.accuracy,
    speedMod: row.speedMod,
    modifiers: (row.modifiers as Partial<Modifiers> | null) ?? null,
    difficulty: row.difficulty as Difficulty,
    modPool: toModPool(row.modPool),
    isFullCombo: row.isFullCombo,
    isPerfect: row.isPerfect,
    achievedAt: row.createdAt.toISOString(),
    isSelf: row.userId === viewerId,
  };
}

/** `window` as a `createdAt` filter. `all` contributes nothing. */
function windowFilter(window: LeaderboardQuery['window']): Prisma.SongLeaderboardWhereInput {
  if (window === 'all') return {};
  const days = LEADERBOARD_WINDOW_DAYS[window];
  return { createdAt: { gte: new Date(Date.now() - days * 86_400_000) } };
}

/**
 * Turn a `scope` into the `where` fragment naming the population it means.
 *
 * Two of the three need something the caller has and might not: a follow graph,
 * and a location. Rather than degrade to global — which produces a "Country"
 * board full of strangers and no way to tell that is what happened — an
 * unresolvable scope reports `unavailable` and the route answers with an empty
 * board and the reason.
 *
 * `friends` is "accounts you follow, plus you". Not mutuals: a leaderboard is
 * something you read to see how you compare to people you are interested in,
 * and requiring them to be interested back shortens the list for no benefit.
 */
async function resolveAudience(
  query: LeaderboardQuery,
  viewerId: string | null,
): Promise<{ where: Prisma.SongLeaderboardWhereInput; unavailable?: 'signed-out' | 'no-location' }> {
  if (query.scope === 'global') return { where: {} };
  if (!viewerId) return { where: {}, unavailable: 'signed-out' };

  if (query.scope === 'friends') {
    const follows = await prisma.follow.findMany({
      where: { followerId: viewerId },
      select: { followingId: true },
      // A board page is at most 100 rows. A follow list longer than this cannot
      // change who is at the top of it, and an unbounded `IN (...)` from an
      // account that follows fifty thousand people is a query plan nobody wants
      // on a read path.
      take: 5_000,
    });
    return { where: { userId: { in: [viewerId, ...follows.map((f) => f.followingId)] } } };
  }

  // `country`. The platform has no country column: `UserProfile.location` is the
  // only geographic thing a user tells us and it is free text. Matching it
  // case-insensitively is an approximation, and it is labelled as one in the UI.
  // Adding a `User.country` column that nothing populates would be a worse
  // approximation wearing a better name.
  const profile = await prisma.userProfile.findUnique({
    where: { userId: viewerId },
    select: { location: true },
  });
  const location = profile?.location?.trim();
  if (!location) return { where: {}, unavailable: 'no-location' };

  return {
    where: { user: { profile: { location: { equals: location, mode: 'insensitive' } } } },
  };
}

/**
 * The caller's own row and rank on a song.
 *
 * Rank is a `count` of strictly-better scores rather than a window function,
 * because Prisma has no portable one and this is a single indexed count against
 * `(songId, difficulty, modPool, score desc)`.
 *
 * It counts within **the board being viewed** — scope, window, tier and pool
 * included. A self row reading "rank 4" on a friends board where the caller is
 * first would be worse than no self row at all.
 *
 * `findFirst` rather than `findUnique`, because the caller may now hold several
 * rows on one song (one per tier per pool — that is the whole point of R1) and
 * a query that omits `difficulty` is asking about all of them. The best one wins,
 * ordered exactly as the page is.
 */
async function selfSongRank(
  songId: string,
  userId: string,
  query: LeaderboardQuery,
): Promise<LeaderboardEntry | null> {
  const audience = await resolveAudience(query, userId);
  if (audience.unavailable) return null;

  const scoped: Prisma.SongLeaderboardWhereInput = {
    songId,
    ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    ...(query.modPool ? { modPool: query.modPool } : {}),
    ...windowFilter(query.window),
    ...audience.where,
  };

  const row = await prisma.songLeaderboard.findFirst({
    where: { ...scoped, userId },
    orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
    select: BOARD_SELECT,
  });
  if (!row) return null;

  const better = await prisma.songLeaderboard.count({
    where: { ...scoped, score: { gt: row.score } },
  });

  return toEntry(row, better + 1, userId);
}

async function selfGlobalRank(userId: string): Promise<LeaderboardEntry | null> {
  const row = await prisma.player.findUnique({
    where: { userId },
    select: { username: true, totalScore: true, user: { select: userDisplaySelect } },
  });
  if (!row) return null;

  const better = await prisma.player.count({ where: { totalScore: { gt: row.totalScore } } });
  const display = row.user ? resolveUser(row.user) : null;

  return {
    rank: better + 1,
    userId,
    username: display?.name || row.username,
    handle: display?.handle ?? null,
    image: display?.image ?? null,
    score: row.totalScore,
    maxCombo: 0,
    accuracy: null,
    speedMod: 1,
    modifiers: null,
    achievedAt: new Date(0).toISOString(),
    isSelf: true,
  };
}
