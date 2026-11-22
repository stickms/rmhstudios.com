import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { lockBuildCommentsApi } from '@/lib/builds/comments.contract';
import { lockCommentsBody } from '@/lib/builds/comments-schema';
import { setCommentsLocked } from '@/lib/builds/comments.server';

/** PUT /api/user-builds/[id]/comments-lock  the build's creator closes or reopens comments. Body: { locked }. */
export const route = apiRoute('/api/user-builds/$id/comments-lock', {
  PUT: implement(
    lockBuildCommentsApi,
    {
      rateLimit: 'write',
      body: lockCommentsBody,
    },
    async ({ params, userId, body }) => {
      const result = await setCommentsLocked(params.id, userId, body.locked);
      if (!result.ok)
        return Response.json(
          {
            error: result.error,
            ...refusalCodeOf(result),
          },
          {
            status: result.status,
          },
        );
      return {
        locked: result.locked,
      };
    },
  ),
});
