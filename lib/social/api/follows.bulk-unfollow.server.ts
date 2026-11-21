import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { bulkUnfollowApi } from '@/lib/social/follow-manager.contract';
import { bulkUnfollowBody } from '@/lib/social/follow-manager-schema';
import { bulkUnfollow } from '@/lib/social/follow-manager.server';

/** POST /api/follows/bulk-unfollow: unfollow up to 200 accounts, each through `unfollowUser`. */
export const route = apiRoute('/api/follows/bulk-unfollow', {
  POST: implement(
    bulkUnfollowApi,
    { rateLimit: 'write', body: bulkUnfollowBody },
    async ({ userId, body }) => bulkUnfollow(userId, body.followingIds),
  ),
});
