import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createConnectionGridApi, listConnectionGridsApi } from '@/lib/party/connections.contract';
import { createGridSchema } from '@/lib/party/connections-schema';
import { createGrid, listGrids } from '@/lib/party/connections.server';

/**
 * GET  /api/connections/grids — today's scheduled daily, top-rated and newest grids.
 * POST /api/connections/grids — author a 4x4 grid (R15).
 */
export const route = apiRoute('/api/connections/grids', {
  GET: implement(listConnectionGridsApi, { auth: 'none', rateLimit: 'read' }, async () =>
    Response.json(await listGrids(), {
      headers: { 'Cache-Control': 'public, max-age=15, s-maxage=30' },
    }),
  ),
  POST: implement(
    createConnectionGridApi,
    { rateLimit: 'write', body: createGridSchema },
    async ({ userId, body }) => {
      const r = await createGrid(userId, body);
      if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
      return Response.json({ id: r.id }, { status: 201 });
    },
  ),
});
