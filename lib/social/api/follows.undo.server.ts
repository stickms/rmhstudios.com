import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { undoUnfollowApi } from '@/lib/social/follow-manager.contract';
import { undoUnfollowBody } from '@/lib/social/follow-manager-schema';
import { undoUnfollow } from '@/lib/social/follow-manager.server';

/** POST /api/follows/undo: follow again right after an unfollow, without a new notification. */
export const route = apiRoute('/api/follows/undo', {
  POST: implement(
    undoUnfollowApi,
    { rateLimit: 'write', body: undoUnfollowBody },
    async ({ userId, body }) => {
      const following = await undoUnfollow(userId, body.followingId);
      if (!following) return Response.json({ error: 'Nothing to undo' }, { status: 409 });
      return { following };
    },
  ),
});
