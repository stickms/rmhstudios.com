import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { rateSchema } from '@/lib/party/connections-schema';
import { rateGrid } from '@/lib/party/connections.server';

/** POST /api/connections/grids/:id/rate — 1-5 stars, only after finishing the grid. */
export const Route = createFileRoute('/api/connections/grids/$id/rate')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: rateSchema },
        async ({ userId, params, body }) => {
          const r = await rateGrid(userId, params.id, body.rating);
          if (r === 'unfinished')
            return Response.json({ error: 'Finish the grid first' }, { status: 409 });
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
