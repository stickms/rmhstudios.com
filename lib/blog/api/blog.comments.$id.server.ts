import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { deleteBlogCommentApi } from '@/lib/blog/blog-comments.contract';
import { canDeleteComment } from '@/lib/blog/blog-comments.server';

/** DELETE /api/blog/comments/$id — soft delete, by the author or an admin. */
export const route = apiRoute('/api/blog/comments/$id',
    {
      DELETE:
        implement(
          deleteBlogCommentApi,
          {
            rateLimit:
              'write',
          },
          async ({
            params,
            userId,
            isAdmin,
          }) => {
            const comment =
              await prisma.blogComment.findFirst(
                {
                  where:
                    {
                      id: params.id,
                      deletedAt:
                        null,
                    },
                  select:
                    {
                      id: true,
                      userId: true,
                    },
                },
              );
            // 404 for a stranger too, so the answer does not say whose comment it is.
            if (
              !comment ||
              !canDeleteComment(
                {
                  id: userId,
                  isAdmin,
                },
                comment.userId,
              )
            ) {
              return Response.json(
                {
                  error:
                    'Not found',
                },
                {
                  status: 404,
                },
              );
            }
            await prisma.blogComment.update(
              {
                where:
                  {
                    id: comment.id,
                  },
                data: {
                  deletedAt:
                    new Date(),
                },
              },
            );
            return Response.json(
              {
                ok: true as const,
              },
            );
          },
        ),
    },
  );
