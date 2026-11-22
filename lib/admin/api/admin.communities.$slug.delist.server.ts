import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { delistCommunityApi } from '@/lib/admin/communities.contract';
import { delistCommunityBody } from '@/lib/admin/communities-schema';
import { COMMUNITY_REFUSAL_STATUS } from '@/lib/admin/communities';
import { CommunityAdminRefused, delistCommunity } from '@/lib/admin/communities.server';

/**
 * POST /api/admin/communities/$slug/delist — take a community out of discovery, with a required reason its moderators
 * read. Members, the page and the feed are unchanged. Audited in the same transaction. Admin only.
 */
export const route = apiRoute('/api/admin/communities/$slug/delist', {
  POST: implement(
    delistCommunityApi,
    { auth: 'admin', rateLimit: 'write', body: delistCommunityBody },
    async ({ userId, params, body }) => {
      try {
        return { community: await delistCommunity(userId, params.slug, body.reason) };
      } catch (error) {
        if (error instanceof CommunityAdminRefused) {
          return Response.json(
            { error: 'This community cannot be taken out of discovery', reason: error.reason },
            { status: COMMUNITY_REFUSAL_STATUS[error.reason] },
          );
        }
        throw error;
      }
    },
  ),
});
