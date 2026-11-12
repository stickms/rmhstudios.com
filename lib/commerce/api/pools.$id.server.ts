import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { getPool } from '@/lib/commerce/pools.server';

export const route = apiRoute('/api/pools/$id', {
  /** GET /api/pools/:id — one pool with its contributor list. */
  GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ params, userId }) => {
    const pool = await getPool(params.id, userId);
    if (!pool) return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
    return Response.json({ pool });
  }),
});
