import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listFollowsApi } from '@/lib/social/follow-manager.contract';
import { listFollowsQuery } from '@/lib/social/follow-manager-schema';
import { listFollows } from '@/lib/social/follow-manager.server';

/** GET /api/follows: one page of the signed-in member's following or followers. */
export const route = apiRoute('/api/follows', {
  GET: implement(
    listFollowsApi,
    { rateLimit: 'read', query: listFollowsQuery },
    async ({ userId, query }) => listFollows(userId, query),
  ),
});
