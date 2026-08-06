import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { resolveUserDisplay, userDisplaySelect } from '@/lib/user-display';
import { LeaderboardQueryZ } from '@/lib/slice-it/api-schemas';
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
 */
export const Route = createFileRoute('/api/slice-it/leaderboard')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', query: LeaderboardQueryZ, rateLimit: 'read' },
        async ({ query, userId }) => {
          const { songId, cursor, limit } = query;

          if (songId) {
            const [rows, total] = await Promise.all([
              prisma.songLeaderboard.findMany({
                where: { songId },
                orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
                skip: cursor,
                take: limit,
                select: {
                  userId: true,
                  score: true,
                  maxCombo: true,
                  accuracy: true,
                  speedMod: true,
                  modifiers: true,
                  createdAt: true,
                  user: { select: userDisplaySelect },
                },
              }),
              prisma.songLeaderboard.count({ where: { songId } }),
            ]);

            const entries: LeaderboardEntry[] = rows.map((row, index) => ({
              rank: cursor + index + 1,
              userId: row.userId,
              username: resolveUserDisplay(row.user).name || 'Unknown',
              image: resolveUserDisplay(row.user).image ?? null,
              score: row.score,
              maxCombo: row.maxCombo,
              accuracy: row.accuracy,
              speedMod: row.speedMod,
              modifiers: (row.modifiers as Partial<Modifiers> | null) ?? null,
              achievedAt: row.createdAt.toISOString(),
              isSelf: row.userId === userId,
            }));

            return Response.json({
              entries,
              total,
              nextCursor: cursor + rows.length < total ? cursor + rows.length : null,
              self: userId ? await selfSongRank(songId, userId) : null,
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

          const entries: LeaderboardEntry[] = rows.map((row, index) => ({
            rank: cursor + index + 1,
            userId: row.userId ?? '',
            username: (row.user ? resolveUserDisplay(row.user).name : null) || row.username,
            image: row.user ? (resolveUserDisplay(row.user).image ?? null) : null,
            score: row.totalScore,
            maxCombo: 0,
            accuracy: null,
            speedMod: 1,
            modifiers: null,
            achievedAt: new Date(0).toISOString(),
            isSelf: Boolean(userId) && row.userId === userId,
          }));

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
 * The caller's own row and rank on a song.
 *
 * Rank is a `count` of strictly-better scores rather than a window function,
 * because Prisma has no portable one and this is a single indexed count against
 * `(songId, score desc)`.
 */
async function selfSongRank(
  songId: string,
  userId: string,
): Promise<(LeaderboardEntry & { rank: number }) | null> {
  const row = await prisma.songLeaderboard.findUnique({
    where: { songId_userId: { songId, userId } },
    select: {
      score: true,
      maxCombo: true,
      accuracy: true,
      speedMod: true,
      modifiers: true,
      createdAt: true,
      user: { select: userDisplaySelect },
    },
  });
  if (!row) return null;

  const better = await prisma.songLeaderboard.count({
    where: { songId, score: { gt: row.score } },
  });

  const display = resolveUserDisplay(row.user);
  return {
    rank: better + 1,
    userId,
    username: display.name || 'You',
    image: display.image ?? null,
    score: row.score,
    maxCombo: row.maxCombo,
    accuracy: row.accuracy,
    speedMod: row.speedMod,
    modifiers: (row.modifiers as Partial<Modifiers> | null) ?? null,
    achievedAt: row.createdAt.toISOString(),
    isSelf: true,
  };
}

async function selfGlobalRank(userId: string): Promise<LeaderboardEntry | null> {
  const row = await prisma.player.findUnique({
    where: { userId },
    select: { username: true, totalScore: true, user: { select: userDisplaySelect } },
  });
  if (!row) return null;

  const better = await prisma.player.count({ where: { totalScore: { gt: row.totalScore } } });
  const display = row.user ? resolveUserDisplay(row.user) : null;

  return {
    rank: better + 1,
    userId,
    username: display?.name || row.username,
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
