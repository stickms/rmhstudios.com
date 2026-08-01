/**
 * POST /api/games/$id/score — the single score-submission endpoint.
 *
 * Replaces one bespoke route per game. Validation, plausibility checks, rate
 * limiting and progression all live in `submitGameScore`; this handler only
 * parses the request and maps the result onto a response.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { submitGameScore } from '@/lib/game/submit.server';

const schema = z.object({
  score: z.number().finite(),
  /** Secondary metric: wave, floor, distance, combo — game-dependent. */
  progress: z.number().finite().optional(),
  /** Run duration in ms; enables the score-rate plausibility check. */
  durationMs: z.number().finite().nonnegative().optional(),
  username: z.string().max(64).optional(),
  /** Game-specific numeric extras; unknown keys are ignored by the adapter. */
  meta: z.record(z.string(), z.number().finite()).optional(),
});

export const Route = createFileRoute('/api/games/$id/score')({
  server: {
    handlers: {
      POST: defineHandler({}, async ({ request, params, session }) => {
        const body = await request.json().catch(() => ({}));
        const parsed = schema.safeParse(body);
        if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

        const result = await submitGameScore({
          gameId: params.id,
          userId: session.user.id,
          ...parsed.data,
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
