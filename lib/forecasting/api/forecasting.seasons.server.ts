import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { CACHE_POLICY } from '@/lib/api/cache-policies';
import { getSeasonBoard, listSeasons } from '@/lib/forecasting/forecasting.server';

/** GET /api/forecasting/seasons?id= — season list plus one season's leaderboard (default: newest). */
export const route = apiRoute('/api/forecasting/seasons', {
  GET: defineHandler(
    {
      auth: 'none',
      rateLimit: 'read',
      query: z.object({ id: z.string().max(40).optional() }),
      // Season list plus one season's board, keyed by ?id=.
      cache: CACHE_POLICY.leaderboard,
    },
    async ({ query }) => {
      const seasons = await listSeasons();
      const id = query.id ?? seasons[0]?.id;
      const board = id ? await getSeasonBoard(id) : null;
      return Response.json({ seasons, board });
    },
  ),
});
