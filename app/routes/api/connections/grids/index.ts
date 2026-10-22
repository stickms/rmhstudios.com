import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { createGridSchema } from '@/lib/party/connections-schema';
import { createGrid, listGrids } from '@/lib/party/connections.server';

/**
 * GET  /api/connections/grids — today's scheduled daily, top-rated and newest grids.
 * POST /api/connections/grids — author a 4x4 grid (R15).
 */
export const Route = createFileRoute('/api/connections/grids/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none', rateLimit: 'read' }, async () =>
        Response.json(await listGrids(), {
          headers: { 'Cache-Control': 'public, max-age=15, s-maxage=30' },
        }),
      ),
      POST: defineHandler(
        { rateLimit: 'write', body: createGridSchema },
        async ({ userId, body }) => {
          const r = await createGrid(userId, body);
          if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
          return Response.json({ id: r.id }, { status: 201 });
        },
      ),
    },
  },
});
