/**
 * POST /api/void-breaker/score — legacy per-game score route.
 *
 * Kept because shipped game builds post here, but it no longer contains any
 * game logic: it maps this game's field names onto the shared pipeline. New
 * games should use POST /api/games/$gameId/score directly.
 */

import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { submitGameScore } from '@/lib/game/submit.server';

export const Route = createFileRoute('/api/void-breaker/score')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const body = await request.json().catch(() => ({}));
          const { username, score, wave, timeMs } = body ?? {};
          if (typeof score !== 'number') {
            return Response.json({ error: 'Invalid score' }, { status: 400 });
          }

          const result = await submitGameScore({
            gameId: 'void-breaker',
            userId: session.user.id,
            score,
            progress: typeof wave === 'number' ? wave : 0,
            durationMs: typeof timeMs === 'number' ? timeMs : undefined,
            username,
          });

          if (!result.ok) {
            return Response.json(
              { error: result.error, reason: result.reason },
              { status: result.status }
            );
          }
          return Response.json({ success: true, linked: true });
        } catch (e) {
          console.error('Failed to submit void-breaker score:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
