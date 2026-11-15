import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/profile/profile-extras.contract';
import { TOP_FOUR_SIZE } from '@/lib/profile/modules';
import { topFourItemSchema } from '@/lib/profile/modules-schema';
import { getTopFour, setTopFour } from '@/lib/profile/top-four.server';

/**
 * GET /api/profile/top-four — the caller's pinned favourites (P1).
 * PUT /api/profile/top-four { items } — replace them. Picks are checked against
 * the game/app catalogs on the server; an empty list removes the module.
 */
export const route = apiRoute('/api/profile/top-four', {
  GET: implement(C.getTopFourApi, { rateLimit: 'read' }, async ({ userId }) =>
    Response.json({ items: await getTopFour(userId) }),
  ),
  PUT: implement(
    C.setTopFourApi,
    {
      rateLimit: { limit: 20, windowMs: 60_000, prefix: 'profile-top-four' },
      body: z.object({ items: z.array(topFourItemSchema).max(TOP_FOUR_SIZE) }),
    },
    async ({ userId, body }) => Response.json({ items: await setTopFour(userId, body.items) }),
  ),
});
