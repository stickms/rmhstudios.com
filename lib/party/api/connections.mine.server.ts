import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { myConnectionGridsApi } from '@/lib/party/connections.contract';
import { listMyGrids } from '@/lib/party/connections.server';

/** GET /api/connections/mine — the caller's own grids: drafts first, then published ones with their figures. */
export const route = apiRoute('/api/connections/mine', {
  GET: implement(myConnectionGridsApi, { rateLimit: 'read' }, async ({ userId }) =>
    Response.json({ grids: await listMyGrids(userId) }, { headers: { 'Cache-Control': 'private, no-store' } }),
  ),
});
