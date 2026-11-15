import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listCapsulesApi } from '@/lib/scheduled/scheduled.contract';
import { listCapsules } from '@/lib/posts-plus/capsules.server';

/** GET /api/scheduled/capsules - the caller's sealed time capsules and recently opened ones (Z7). */
export const route = apiRoute('/api/scheduled/capsules', {
  GET: implement(listCapsulesApi, { rateLimit: 'read' }, async ({ userId }) =>
    Response.json(await listCapsules(userId), {
      headers: { 'Cache-Control': 'private, no-store' },
    }),
  ),
});
