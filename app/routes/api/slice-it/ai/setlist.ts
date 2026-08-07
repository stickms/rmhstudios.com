/**
 * POST /api/slice-it/ai/setlist — build a practice set. (Feature 7.)
 *
 * Returns `{ setlist, items }`, both null when AI is unavailable. There is no
 * degraded path here and that is deliberate: an arbitrary ordering of songs is
 * not a setlist, and shipping one under that heading would be the feature
 * claiming to have done something it did not.
 *
 * The lower rate limit reflects the cost — this is the largest prompt in the
 * game (forty candidate songs) and nobody needs to build a setlist twice a
 * minute.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { assertAiBudget } from '@/lib/ai/budget.server';
import { SetlistRequestZ } from '@/lib/slice-it/ai/api-schemas';
import { buildSetlist } from '@/lib/slice-it/ai/discovery.server';
import { isAiConfigured } from '@/lib/slice-it/ai/run.server';

export const Route = createFileRoute('/api/slice-it/ai/setlist')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          body: SetlistRequestZ,
          rateLimit: {
            policy: 'ai',
            limit: 5,
            windowMs: 60_000,
            prefix: 'slice-setlist',
            scope: 'user',
          },
        },
        async ({ userId, body }) => {
          if (!isAiConfigured()) return Response.json({ setlist: null, items: null });
          await assertAiBudget(userId);

          const result = await buildSetlist(
            { goal: body.goal, minutes: body.minutes, userId },
            { userId },
          );

          return Response.json(result ?? { setlist: null, items: null });
        },
      ),
    },
  },
});
