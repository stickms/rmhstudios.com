import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { pageErrorResponse } from '@/lib/communities/page-access.server';
import { communityPageUpdateSchema } from '@/lib/communities/pages-schema';
import { updateCommunityPage, deleteCommunityPage, CommunityPageError } from '@/lib/communities/pages.server';
import { deleteCommunityPageApi, updateCommunityPageApi } from '@/lib/communities/pages.contract';

/**
 * PATCH  /api/community-pages/:id — edit (subject to the page's `editPolicy`; 409 when `baseUpdatedAt` is stale).
 * DELETE /api/community-pages/:id — moderators only.
 *
 * Both go through `pageAccess` inside the service: a non-member of a private community gets a 404, a banned or
 * timed-out member a 403 with `code` and `endsAt`.
 */
export const route = apiRoute('/api/community-pages/$id', {
  PATCH: implement(
    updateCommunityPageApi,
    {
      rateLimit: { limit: 40, windowMs: 3_600_000, prefix: 'community-page', scope: 'user' },
      body: communityPageUpdateSchema,
    },
    async ({ params, userId, isAdmin, body }) => {
      try {
        return await updateCommunityPage(userId, params.id, body, isAdmin);
      } catch (error) {
        if (error instanceof CommunityPageError) return pageErrorResponse(error);
        throw error;
      }
    },
  ),
  DELETE: implement(deleteCommunityPageApi, { rateLimit: 'write' }, async ({ params, userId, isAdmin }) => {
    try {
      await deleteCommunityPage(userId, params.id, isAdmin);
      return { ok: true as const };
    } catch (error) {
      if (error instanceof CommunityPageError) return pageErrorResponse(error);
      throw error;
    }
  }),
});
