/**
 * POST /api/void-breaker/score — legacy per-game score route.
 *
 * Kept because shipped game builds post here, but it no longer contains any
 * game logic: it maps this game's field names onto the shared pipeline. New
 * games should use POST /api/games/$gameId/score directly.
 */

import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { submitVoidBreakerScoreApi } from '@/lib/game/score.contract';
import { voidBreakerScoreBody } from '@/lib/game/score-schema';
import { submitGameScore } from '@/lib/game/submit.server';

export const route = apiRoute('/api/void-breaker/score', {
  POST: implement(
    submitVoidBreakerScoreApi,
    {
      body: voidBreakerScoreBody,
      invalid: () => Response.json({ error: 'Invalid score' }, { status: 400 }),
    },
    async ({ session, body }) => {
      const { username, score, wave, timeMs } = body;

      const result = await submitGameScore({
        gameId: 'void-breaker',
        userId: session.user.id,
        score,
        progress: typeof wave === 'number' ? wave : 0,
        durationMs: typeof timeMs === 'number' ? timeMs : undefined,
        username: username as string | undefined,
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
