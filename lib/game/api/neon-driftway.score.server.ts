/**
 * POST /api/neon-driftway/score — legacy per-game score route.
 *
 * Kept because shipped game builds post here, but it no longer contains any
 * game logic: it maps this game's field names onto the shared pipeline. New
 * games should use POST /api/games/$gameId/score directly.
 *
 * Migrating also fixed a silent gap — this route recorded a play but never
 * called `reportGameResult`, so Neon Driftway runs never advanced an arcade
 * challenge. The shared pipeline calls both, so the bug can't recur per-game.
 */

import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { submitNeonDriftwayScoreApi } from '@/lib/game/score.contract';
import { neonDriftwayScoreBody } from '@/lib/game/score-schema';
import { submitGameScore } from '@/lib/game/submit.server';

export const route = apiRoute('/api/neon-driftway/score', {
  POST: implement(
    submitNeonDriftwayScoreApi,
    {
      body: neonDriftwayScoreBody,
      invalid: () => Response.json({ error: 'Invalid score' }, { status: 400 }),
    },
    async ({ session, body }) => {
      const { username, score, distance, timeMs, level } = body;

      const result = await submitGameScore({
        gameId: 'neon-driftway',
        userId: session.user.id,
        score,
        progress: typeof distance === 'number' ? distance : 0,
        durationMs: typeof timeMs === 'number' ? timeMs : undefined,
        username: username as string | undefined,
        ...(typeof level === 'number' ? { meta: { level } } : {}),
      });

      if (!result.ok) {
        return Response.json(
          { error: result.error, reason: result.reason },
          { status: result.status },
        );
      }
      return Response.json({ success: true, linked: true, moment: result.moment ?? null });
    },
  ),
});
