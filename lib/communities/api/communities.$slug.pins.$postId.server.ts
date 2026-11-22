import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/pins.contract';
import { requireMod } from '@/lib/communities/guard.server';
import { unpinPost } from '@/lib/communities/pins.server';

/** DELETE /api/communities/$slug/pins/$postId — unpin (moderators). Silent for the author. */
export const route = apiRoute('/api/communities/$slug/pins/$postId', {
  DELETE: implement(C.unpinCommunityPostApi, { rateLimit: 'write' }, async ({ params, session }) => {
    const guard = await requireMod(params.slug, session.user.id);
    if (!guard.ok) return guard.response;
    const result = await unpinPost({
      communityId: guard.value.id,
      postId: params.postId,
      actorId: session.user.id,
    });
    return Response.json(result);
  }),
});
