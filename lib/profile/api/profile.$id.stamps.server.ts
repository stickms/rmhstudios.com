import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/profile/profile-extras.contract';
import { getWall } from '@/lib/profile/stamps.server';

/**
 * GET /api/profile/$id/stamps — a member's stamp wall (P5), newest first, with
 * whether the signed-in viewer already has each stamp. Per-viewer, so never
 * cached by a shared cache. `$id` is the user id.
 */
export const route = apiRoute('/api/profile/$id/stamps', {
  GET: implement(
    C.getProfileStampsApi,
    { auth: 'optional', rateLimit: 'read' },
    async ({ params, userId }) =>
      Response.json(
        { stamps: await getWall(params.id, userId) },
        { headers: { 'Cache-Control': 'private, no-store' } },
      ),
  ),
});
