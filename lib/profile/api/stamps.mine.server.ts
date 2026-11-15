import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { myStampsApi } from '@/lib/profile/stamps.contract';
import { listMyStamps } from '@/lib/profile/stamps.server';

/** GET /api/stamps/mine — the stamps the caller has made (P5). */
export const route = apiRoute('/api/stamps/mine', {
  GET: implement(myStampsApi, { rateLimit: 'read' }, async ({ userId }) =>
    Response.json(
      { stamps: await listMyStamps(userId) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    ),
  ),
});
