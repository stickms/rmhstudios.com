import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { relistCommunityApi } from '@/lib/admin/communities.contract';
import { COMMUNITY_REFUSAL_STATUS } from '@/lib/admin/communities';
import { CommunityAdminRefused, relistCommunity } from '@/lib/admin/communities.server';

/** POST /api/admin/communities/$slug/relist — return a community to discovery. Audited. Admin only. */
export const route = apiRoute('/api/admin/communities/$slug/relist', {
  POST: implement(relistCommunityApi, { auth: 'admin', rateLimit: 'write' }, async ({ userId, params }) => {
    try {
      return { community: await relistCommunity(userId, params.slug) };
    } catch (error) {
      if (error instanceof CommunityAdminRefused) {
        return Response.json(
          { error: 'This community is not out of discovery', reason: error.reason },
          { status: COMMUNITY_REFUSAL_STATUS[error.reason] },
        );
      }
      throw error;
    }
  }),
});
