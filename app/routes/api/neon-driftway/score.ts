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

import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { submitGameScore } from '@/lib/game/submit.server';

export const Route = createFileRoute('/api/neon-driftway/score')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const body = await request.json().catch(() => ({}));
          const { username, score, distance, timeMs, level } = body ?? {};
          if (typeof score !== 'number') {
            return Response.json({ error: 'Invalid score' }, { status: 400 });
          }

          const result = await submitGameScore({
            gameId: 'neon-driftway',
            userId: session.user.id,
            score,
            progress: typeof distance === 'number' ? distance : 0,
            durationMs: typeof timeMs === 'number' ? timeMs : undefined,
            username,
            ...(typeof level === 'number' ? { meta: { level } } : {}),
          });

          if (!result.ok) {
            return Response.json(
              { error: result.error, reason: result.reason },
              { status: result.status }
            );
          }
          return Response.json({ success: true, linked: true });
        } catch (e) {
          console.error('Failed to submit neon-driftway score:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
