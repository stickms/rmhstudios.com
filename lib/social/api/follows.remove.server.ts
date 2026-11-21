import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { removeFollowersApi } from '@/lib/social/follow-manager.contract';
import { removeFollowersBody } from '@/lib/social/follow-manager-schema';
import { bulkRemoveFollowers } from '@/lib/social/follow-manager.server';

/** POST /api/follows/remove: remove followers (one or many). Not a block; they are not told. */
export const route = apiRoute('/api/follows/remove', {
  POST: implement(
    removeFollowersApi,
    { rateLimit: 'write', body: removeFollowersBody },
    async ({ userId, body }) => bulkRemoveFollowers(userId, body.followerIds),
  ),
});
