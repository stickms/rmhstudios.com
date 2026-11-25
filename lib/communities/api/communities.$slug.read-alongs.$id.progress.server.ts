import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/read-along.contract';
import { refusalBody } from '@/lib/errors/codes';
import { communityWithRole } from '@/lib/communities/guard.server';
import { progressBody } from '@/lib/communities/read-along-schema';
import { ReadAlongError, markPart, refusalResponse } from '@/lib/communities/read-along.server';

/** PUT /api/communities/$slug/read-alongs/$id/progress — "I've finished this part": the reader's own last finished part. */
export const route = apiRoute('/api/communities/$slug/read-alongs/$id/progress', {
  PUT: implement(
    C.readAlongProgressApi,
    {
      rateLimit: 'write',
      body: progressBody,
    },
    async ({ params, session, body }) => {
      const community = await communityWithRole(params.slug, session.user.id);
      if (!community || (community.isPrivate && !community.role)) {
        return Response.json({ ...refusalBody('NOT_FOUND') }, { status: 404 });
      }
      try {
        const done = await markPart({
          communityId: community.id,
          id: params.id,
          userId: session.user.id,
          part: body.part,
        });
        return { success: true as const, lastPartDone: done.lastPartDone };
      } catch (e) {
        if (e instanceof ReadAlongError) return refusalResponse(e);
        throw e;
      }
    },
  ),
});
