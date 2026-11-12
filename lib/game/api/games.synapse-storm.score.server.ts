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

import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { submitSynapseStormScoreApi } from '@/lib/game/score.contract';
import { synapseStormScoreBody } from '@features/synapse-storm/engine/score-schema';
import { submitGameScore } from '@/lib/game/submit.server';

export const route = apiRoute('/api/games/synapse-storm/score', {
  POST: implement(
    submitSynapseStormScoreApi,
    {
      body: synapseStormScoreBody,
      invalid: () => Response.json({ error: 'Invalid score data' }, { status: 400 }),
    },
    async ({ session, body }) => {
      const { score, puzzlesSolved, maxCombo, peakDifficulty, totalTime } = body;

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
      return Response.json({ success: true, moment: result.moment ?? null });
    },
  ),
});
