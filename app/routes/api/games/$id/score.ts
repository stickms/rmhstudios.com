/**
 * POST /api/games/$id/score — the single score-submission endpoint.
 *
 * Replaces one bespoke route per game. Validation, plausibility checks, rate
 * limiting and progression all live in `submitGameScore`; this handler only
 * parses the request and maps the result onto a response.
 */

import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { submitGameScoreApi } from '@/lib/game/score.contract';
import { gameScoreBody } from '@/lib/game/score-schema';
import { submitGameScore } from '@/lib/game/submit.server';

export const Route = createFileRoute('/api/games/$id/score')({
  server: {
    handlers: {
      POST: implement(
        submitGameScoreApi,
        { body: gameScoreBody, allowEmptyBody: true },
        async ({ params, session, body }) => {
          const result = await submitGameScore({
            gameId: params.id,
            userId: session.user.id,
            ...body,
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
    },
  },
});
