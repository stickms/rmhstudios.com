import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { recommend, type Slot } from '@/lib/recommend/recommend.server';

/**
 * `GET /api/recommend` — fill a rail (M2).
 *
 * `auth: 'optional'` on purpose: with no session the scoring degrades to
 * popularity and recency, which is a perfectly good rail and is what a
 * signed-out visitor should see. Returning 401 would mean every surface needs a
 * signed-out branch, which is how four surfaces ended up with four orderings.
 *
 * Responses are per-member, so `visibility: 'private'` — the one field on
 * `CacheSpec` that has no default, because getting it wrong serves one
 * member's recommendations to another from the CDN.
 */

const query = z.object({
  slot: z.enum(['games', 'apps', 'posts', 'library', 'builds']),
  limit: z.coerce.number().int().min(1).max(60).optional(),
  /** Anchor for "more like this". Uses the stored vector; no model call. */
  similarTo: z.string().max(64).optional(),
});

export const Route = createFileRoute('/api/recommend/')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'optional',
          rateLimit: 'read',
          query,
          cache: { visibility: 'private', maxAge: 60 },
        },
        async ({ userId, query: q }) =>
          Response.json({
            slot: q.slot,
            items: await recommend(q.slot as Slot, userId, {
              limit: q.limit,
              similarToId: q.similarTo,
            }),
          }),
      ),
    },
  },
});
