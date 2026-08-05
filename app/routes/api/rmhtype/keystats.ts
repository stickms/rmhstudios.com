/**
 * `/api/rmhtype/keystats` — per-key analytics (design G1).
 *
 * The body is a set of AGGREGATES: one entry per character with three counters.
 * The schema is the enforcement of that — `key` is a single character with an
 * explicit length ceiling, and there is no field in which an ordered keystroke
 * stream could arrive. A client that wanted to send one would have to send 400
 * one-attempt aggregates, which reconstructs nothing because the request carries
 * no order.
 *
 * DELETE clears the caller's own analytics for a layout.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { KEYSTAT_LIMITS, TYPING_LAYOUTS } from '@/lib/rmhtype/keystats';
import {
  clearKeyStats,
  getKeyStats,
  normalizeLayout,
  recordKeyStats,
} from '@/lib/rmhtype/keystats.server';

const layoutSchema = z.enum(TYPING_LAYOUTS);

const querySchema = z.object({
  layout: layoutSchema.optional(),
});

const bodySchema = z.object({
  layout: layoutSchema,
  keys: z
    .array(
      z.object({
        // One character. `max(2)` allows a surrogate pair (one emoji is two
        // UTF-16 units); anything longer is a string, and a string is a log.
        key: z.string().min(1).max(2),
        attempts: z.number().int().min(1).max(KEYSTAT_LIMITS.maxAttemptsPerKey),
        errors: z.number().int().min(0).max(KEYSTAT_LIMITS.maxAttemptsPerKey),
        totalMs: z
          .number()
          .int()
          .min(0)
          .max(KEYSTAT_LIMITS.maxAttemptsPerKey * KEYSTAT_LIMITS.maxKeystrokeMs),
      }),
    )
    .min(1)
    .max(KEYSTAT_LIMITS.maxKeys),
});

export const Route = createFileRoute('/api/rmhtype/keystats')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read', query: querySchema }, async ({ userId, query }) =>
        Response.json({ stats: await getKeyStats(userId, normalizeLayout(query.layout)) }),
      ),

      POST: defineHandler(
        {
          // Per user, not per IP: a shared network must not throttle a whole
          // household's typing practice. One submission per finished test, so 60
          // a minute is far beyond any real cadence.
          rateLimit: { policy: 'write', scope: 'user', prefix: 'rmhtype-keystats', limit: 60 },
          body: bodySchema,
        },
        async ({ userId, body }) => {
          const result = await recordKeyStats(userId, body.layout, body.keys);
          return Response.json(result);
        },
      ),

      DELETE: defineHandler(
        { rateLimit: 'write', query: querySchema },
        async ({ userId, query }) => {
          const deleted = await clearKeyStats(userId, normalizeLayout(query.layout));
          return Response.json({ deleted });
        },
      ),
    },
  },
});
