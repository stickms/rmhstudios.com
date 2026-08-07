/**
 * POST /api/slice-it/ai/rival — how to overtake the row above you. (Feature 12.)
 *
 * Returns `{ diff, plan }`. `diff` is the arithmetic breakdown of the gap and
 * is always present; `plan` is the model's reading of it and is null when AI is
 * unavailable. So the leaderboard can always show "2,400 behind, and 0.35x of
 * that is their speed modifier" even with no provider — which is most of the
 * insight for none of the cost.
 *
 * **Both rows are read from the database.** The client says which rank it is
 * looking at and nothing else. Letting a body describe its own rival would make
 * this a text generator pointed at an invented opponent.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { assertAiBudget } from '@/lib/ai/budget.server';
import { prisma } from '@/lib/prisma.server';
import { resolveUserDisplay, userDisplaySelect } from '@/lib/user-display';
import { RivalRequestZ } from '@/lib/slice-it/ai/api-schemas';
import { diffRuns, planAgainstRival, type RivalRow } from '@/lib/slice-it/ai/match.server';
import { isAiConfigured } from '@/lib/slice-it/ai/run.server';
import { describeChartPlainly } from '@/lib/slice-it/ai/chart.server';
import { loadSongFacts } from '@/lib/slice-it/ai/song-facts.server';
import type { Modifiers } from '@/lib/slice-it/types';

export const Route = createFileRoute('/api/slice-it/ai/rival')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          body: RivalRequestZ,
          rateLimit: {
            policy: 'ai',
            limit: 10,
            windowMs: 60_000,
            prefix: 'slice-rival',
            scope: 'user',
          },
        },
        async ({ userId, body }) => {
          const song = await loadSongFacts(body.songId, userId);
          if (!song) return Response.json({ error: 'Song not found' }, { status: 404 });

          // A song has one board per `(difficulty, modPool)`, so the rank the
          // client is pointing at only means something on the board it is
          // displaying. Both filters are applied exactly as the leaderboard
          // route applies them — an omitted one means the combined view, and
          // ranking has to match or the "row above you" is somebody else.
          const board = {
            songId: body.songId,
            ...(body.difficulty ? { difficulty: body.difficulty } : {}),
            ...(body.modPool ? { modPool: body.modPool } : {}),
          };

          // `rivalRank` is 1-based and the row above the player is what the UI
          // points at, so the offset is rank - 1.
          const rows = await prisma.songLeaderboard.findMany({
            where: board,
            orderBy: [{ score: 'desc' }, { id: 'asc' }],
            skip: Math.max(0, body.rivalRank - 1),
            take: 1,
            select: {
              userId: true,
              score: true,
              maxCombo: true,
              accuracy: true,
              speedMod: true,
              modifiers: true,
              user: { select: userDisplaySelect },
            },
          });

          const rivalRow = rows[0];
          if (!rivalRow) return Response.json({ error: 'No score at that rank' }, { status: 404 });
          if (rivalRow.userId === userId) {
            return Response.json({ error: 'That row is your own' }, { status: 400 });
          }

          const mine = await prisma.songLeaderboard.findFirst({
            where: { ...board, userId },
            orderBy: { score: 'desc' },
            select: {
              score: true,
              maxCombo: true,
              accuracy: true,
              speedMod: true,
              modifiers: true,
            },
          });
          if (!mine) {
            return Response.json(
              { error: 'Play this chart once before asking how to beat it' },
              { status: 400 },
            );
          }

          const player: RivalRow = {
            name: 'you',
            score: mine.score,
            maxCombo: mine.maxCombo,
            accuracy: mine.accuracy,
            speedMod: mine.speedMod,
            modifiers: (mine.modifiers ?? null) as Partial<Modifiers> | null,
          };
          const rival: RivalRow = {
            name: resolveUserDisplay(rivalRow.user).name || 'the player above you',
            score: rivalRow.score,
            maxCombo: rivalRow.maxCombo,
            accuracy: rivalRow.accuracy,
            speedMod: rivalRow.speedMod,
            modifiers: (rivalRow.modifiers ?? null) as Partial<Modifiers> | null,
          };

          const diff = diffRuns(player, rival);
          if (!isAiConfigured()) return Response.json({ diff, plan: null });
          await assertAiBudget(userId);

          const plan = await planAgainstRival(
            {
              songTitle: song.title,
              ...(song.facts ? { difficultyNote: describeChartPlainly(song.facts) } : {}),
              player,
              rival,
            },
            { userId },
          );

          return Response.json({ diff, plan });
        },
      ),
    },
  },
});
