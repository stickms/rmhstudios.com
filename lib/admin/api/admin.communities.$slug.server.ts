import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getAdminCommunityApi } from '@/lib/admin/communities.contract';
import { COMMUNITY_REFUSAL_STATUS } from '@/lib/admin/communities';
import { CommunityAdminRefused, getAdminCommunity } from '@/lib/admin/communities.server';

/**
 * GET /api/admin/communities/$slug — one community: its moderators and their last action, the last 20 mod-log
 * entries and its open reports. Admin only.
 */
export const route = apiRoute('/api/admin/communities/$slug', {
  GET: implement(getAdminCommunityApi, { auth: 'admin', rateLimit: 'read' }, async ({ params }) => {
    try {
      return await getAdminCommunity(params.slug);
    } catch (error) {
      if (error instanceof CommunityAdminRefused) {
        return Response.json(
          { error: 'Community not found', reason: error.reason },
          { status: COMMUNITY_REFUSAL_STATUS[error.reason] },
        );
      }
      throw error;
    }
  }),
});
