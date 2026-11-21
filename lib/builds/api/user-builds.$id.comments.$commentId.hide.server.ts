import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { hideBuildCommentApi } from '@/lib/builds/comments.contract';
import { hideCommentBody } from '@/lib/builds/comments-schema';
import { hideComment } from '@/lib/builds/comments.server';

/** POST /api/user-builds/[id]/comments/[commentId]/hide  the build's creator hides or unhides a comment. Body: { hidden }. */
export const route =
  apiRoute(
    '/api/user-builds/$id/comments/$commentId/hide',
    {
      POST: implement(
        hideBuildCommentApi,
        {
          rateLimit:
            'write',
          body: hideCommentBody,
        },
        async ({
          params,
          userId,
          body,
        }) => {
          const result =
            await hideComment(
              params.id,
              params.commentId,
              userId,
              body.hidden,
            );
          if (
            !result.ok
          )
            return Response.json(
              {
                error:
                  result.error,
              },
              {
                status:
                  result.status,
              },
            );
          return {
            hidden:
              result.hidden,
          };
        },
      ),
    },
  );
