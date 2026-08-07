/**
 * POST /api/slice-it/ai/loadout — what to turn on for this chart. (Feature 5.)
 *
 * Unlike the chart brief, this is per-player and therefore uncached: it reads
 * the caller's leaderboard history to size the recommendation against what they
 * actually clear.
 *
 * The player profile is assembled here rather than accepted from the body for
 * the obvious reason — a client that could describe its own ability would be
 * asking the advisor to recommend whatever it already wanted.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { assertAiBudget } from '@/lib/ai/budget.server';
import { prisma } from '@/lib/prisma.server';
import { LoadoutRequestZ } from '@/lib/slice-it/ai/api-schemas';
import { recommendLoadout, type PlayerProfile } from '@/lib/slice-it/ai/chart.server';
import { isAiConfigured } from '@/lib/slice-it/ai/run.server';
import { loadSongFacts } from '@/lib/slice-it/ai/song-facts.server';
import { DIFFICULTIES, type Difficulty } from '@/lib/slice-it/constants';
import type { Modifiers } from '@/lib/slice-it/types';

/** Recent rows read to size the player. Enough to be representative, cheap to read. */
const HISTORY_ROWS = 40;

export const Route = createFileRoute('/api/slice-it/ai/loadout')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          body: LoadoutRequestZ,
          rateLimit: {
            policy: 'ai',
            limit: 10,
            windowMs: 60_000,
            prefix: 'slice-loadout',
            scope: 'user',
          },
        },
        async ({ userId, body }) => {
          if (!isAiConfigured()) return Response.json({ loadout: null });

          const song = await loadSongFacts(body.songId, userId, { difficulty: body.difficulty });
          if (!song) return Response.json({ error: 'Song not found' }, { status: 404 });
          if (!song.facts) return Response.json({ loadout: null });

          await assertAiBudget(userId);

          const [history, onThisChart] = await Promise.all([
            prisma.songLeaderboard.findMany({
              where: { userId },
              orderBy: { createdAt: 'desc' },
              take: HISTORY_ROWS,
              select: { accuracy: true, modifiers: true },
            }),
            prisma.songLeaderboard.findUnique({
              where: { songId_userId: { songId: song.id, userId } },
              select: { score: true, accuracy: true, modifiers: true },
            }),
          ]);

          const profile: PlayerProfile = {
            runsPlayed: history.length,
            bestAccuracy: history.reduce<number | null>(
              (best, row) =>
                row.accuracy === null
                  ? best
                  : best === null
                    ? row.accuracy
                    : Math.max(best, row.accuracy),
              null,
            ),
            usualDifficulty: modalDifficulty(history.map((row) => row.modifiers)),
            timing: body.timing ?? null,
            bestOnThisChart: onThisChart
              ? {
                  score: onThisChart.score,
                  accuracy: onThisChart.accuracy ?? 0,
                  difficulty: difficultyOf(onThisChart.modifiers) ?? body.difficulty,
                }
              : null,
          };

          const loadout = await recommendLoadout(
            {
              songTitle: song.title,
              songArtist: song.artist,
              facts: song.facts,
              player: profile,
            },
            { userId },
          );

          return Response.json({ loadout });
        },
      ),
    },
  },
});

/** The difficulty stored on a leaderboard row's JSON modifiers, if it is a valid one. */
function difficultyOf(modifiers: unknown): Difficulty | null {
  const value = (modifiers as Partial<Modifiers> | null)?.difficulty;
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value)
    ? (value as Difficulty)
    : null;
}

/** The difficulty a player picks most often across their recent rows. */
function modalDifficulty(rows: readonly unknown[]): Difficulty | null {
  const counts = new Map<Difficulty, number>();
  for (const row of rows) {
    const difficulty = difficultyOf(row);
    if (difficulty) counts.set(difficulty, (counts.get(difficulty) ?? 0) + 1);
  }
  let best: Difficulty | null = null;
  let bestCount = 0;
  for (const [difficulty, count] of counts) {
    if (count > bestCount) {
      best = difficulty;
      bestCount = count;
    }
  }
  return best;
}
