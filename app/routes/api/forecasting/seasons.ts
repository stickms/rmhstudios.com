import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getSeasonBoard, listSeasons } from '@/lib/forecasting/forecasting.server';

/** GET /api/forecasting/seasons?id= — season list plus one season's leaderboard (default: newest). */
export const Route = createFileRoute('/api/forecasting/seasons')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: 'read', query: z.object({ id: z.string().max(40).optional() }) },
        async ({ query }) => {
          const seasons = await listSeasons();
          const id = query.id ?? seasons[0]?.id;
          const board = id ? await getSeasonBoard(id) : null;
          return Response.json({ seasons, board });
        },
      ),
    },
  },
});
