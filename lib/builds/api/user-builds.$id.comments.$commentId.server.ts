import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  deleteBuildCommentApi,
  editBuildCommentApi,
} from '@/lib/builds/comments.contract';
import { editCommentBody } from '@/lib/builds/comments-schema';
import {
  deleteComment,
  editComment,
} from '@/lib/builds/comments.server';

/**
 * PATCH  /api/user-builds/[id]/comments/[commentId]  the author fixes their words (30 minutes from posting)
 * DELETE /api/user-builds/[id]/comments/[commentId]  the author, or an admin as moderation (soft delete)
 */
export const route =
  apiRoute(
    '/api/user-builds/$id/comments/$commentId',
    {
      PATCH:
        implement(
          editBuildCommentApi,
          {
            rateLimit:
              'write',
            body: editCommentBody,
          },
          async ({
            params,
            userId,
            body,
          }) => {
            const result =
              await editComment(
                params.id,
                params.commentId,
                userId,
                body.content,
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
              comment:
                {
                  id: params.commentId,
                  content:
                    result.content,
                  edited: true,
                },
            };
          },
        ),
      DELETE:
        implement(
          deleteBuildCommentApi,
          {
            rateLimit:
              'write',
          },
          async ({
            params,
            userId,
            isAdmin,
          }) => {
            const result =
              await deleteComment(
                params.id,
                params.commentId,
                userId,
                isAdmin,
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
              success:
                true as const,
            };
          },
        ),
    },
  );
