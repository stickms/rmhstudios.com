import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/read-along.contract';
import { refusalBody } from '@/lib/errors/codes';
import { communityWithRole } from '@/lib/communities/guard.server';
import { joinReadAlongBody } from '@/lib/communities/read-along-schema';
import { ReadAlongError, joinReadAlong, leaveReadAlong, refusalResponse } from '@/lib/communities/read-along.server';

/**
 * POST   /api/communities/$slug/read-alongs/$id/join — join (members only; a community ban or timeout refuses), or
 *        change "Tell me when a part opens" when already joined.
 * DELETE /api/communities/$slug/read-alongs/$id/join — leave.
 * A private community's read-along answers a non-member with a 404.
 */
export const route = apiRoute('/api/communities/$slug/read-alongs/$id/join', {
  POST: implement(
    C.joinReadAlongApi,
    {
      rateLimit: 'write',
      body: joinReadAlongBody,
      allowEmptyBody: true,
    },
    async ({ params, session, body }) => {
      const community = await communityWithRole(params.slug, session.user.id);
      if (!community || (community.isPrivate && !community.role)) {
        return Response.json({ ...refusalBody('NOT_FOUND') }, { status: 404 });
      }
      try {
        const joined = await joinReadAlong({
          communityId: community.id,
          id: params.id,
          userId: session.user.id,
          notify: body?.notify,
        });
        return { success: true as const, notify: joined.notify };
      } catch (e) {
        if (e instanceof ReadAlongError) return refusalResponse(e);
        throw e;
      }
    },
  ),
  DELETE: implement(
    C.leaveReadAlongApi,
    {
      rateLimit: 'write',
    },
    async ({ params, session }) => {
      const community = await communityWithRole(params.slug, session.user.id);
      if (!community || (community.isPrivate && !community.role)) {
        return Response.json({ ...refusalBody('NOT_FOUND') }, { status: 404 });
      }
      try {
        await leaveReadAlong({ communityId: community.id, id: params.id, userId: session.user.id });
        return { success: true as const };
      } catch (e) {
        if (e instanceof ReadAlongError) return refusalResponse(e);
        throw e;
      }
    },
  ),
});
