import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/handover.contract';
import { listOwnedCommunities } from '@/lib/communities/handover.server';

/**
 * GET /api/admin/users/$id/owned-communities — the communities this user created, with whether the owner is
 * gone (deleted or banned) and, for those, the moderators the admin can assign. Admin only.
 */
export const route = apiRoute('/api/admin/users/$id/owned-communities', {
  GET: implement(C.listOwnedCommunitiesApi, { auth: 'admin', rateLimit: 'read' }, async ({ params }) => ({
    communities: await listOwnedCommunities(params.id),
  })),
});
