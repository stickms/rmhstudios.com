import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { TOP_FOUR_SIZE, topFourItemSchema } from '@/lib/profile/modules';
import { getTopFour, setTopFour } from '@/lib/profile/top-four.server';

/**
 * GET /api/profile/top-four — the caller's pinned favourites (P1).
 * PUT /api/profile/top-four { items } — replace them. Picks are checked against
 * the game/app catalogs on the server; an empty list removes the module.
 */
export const Route = createFileRoute('/api/profile/top-four')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json({ items: await getTopFour(userId) }),
      ),
      PUT: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'profile-top-four' },
          body: z.object({ items: z.array(topFourItemSchema).max(TOP_FOUR_SIZE) }),
        },
        async ({ userId, body }) => Response.json({ items: await setTopFour(userId, body.items) }),
      ),
    },
  },
});
