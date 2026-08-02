/**
 * POST /api/games/synapse-storm/score — this game's score route.
 *
 * Kept as a dedicated route because Synapse Storm has cross-field validity
 * rules the shared registry can't express (a score requires solved puzzles; a
 * combo can't exceed the number of puzzles solved). Those stay here; everything
 * generic — the balance of rate limiting, ceilings, plausibility checks,
 * persistence and progression — is delegated to the shared pipeline.
 *
 * Delegating also fixed two defects: the old handler read the current bests and
 * wrote `Math.max(read, new)` (a lost update when two submissions overlap), and
 * it never called `reportGameResult`, so Synapse Storm runs silently failed to
 * advance any arcade challenge.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { submitGameScore } from '@/lib/game/submit.server';

const scoreSchema = z
  .object({
    score: z.number().int().min(0).max(10_000_000),
    puzzlesSolved: z.number().int().min(0).max(10_000),
    maxCombo: z.number().int().min(0).max(10_000),
    peakDifficulty: z.number().int().min(1).max(100),
    totalTime: z.number().finite().min(0).max(86_400),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.puzzlesSolved === 0 && value.score > 0)
      ctx.addIssue({ code: 'custom', message: 'Score requires solved puzzles' });
    if (value.maxCombo > value.puzzlesSolved)
      ctx.addIssue({ code: 'custom', message: 'Combo exceeds solved puzzles' });
  });

export const Route = createFileRoute('/api/games/synapse-storm/score')({
  server: {
    handlers: {
      POST: defineHandler({}, async ({ request, session }) => {
        const parsed = scoreSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: 'Invalid score data' }, { status: 400 });
        }
        const { score, puzzlesSolved, maxCombo, peakDifficulty, totalTime } = parsed.data;

        const result = await submitGameScore({
          gameId: 'synapse-storm',
          userId: session.user.id,
          score,
          progress: maxCombo,
          // The client reports seconds; the pipeline works in milliseconds.
          durationMs: Math.round(totalTime * 1000),
          meta: { puzzlesSolved, peakDifficulty },
        });

        if (!result.ok) {
          return Response.json(
            { error: result.error, reason: result.reason },
            { status: result.status },
          );
        }
        return Response.json({ success: true });
      }),
    },
  },
});
