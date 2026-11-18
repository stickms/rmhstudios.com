import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { screenNewContent } from '@/lib/moderation/auto-moderate.server';
import {
  createBlogCommentApi,
  listBlogCommentsApi,
} from '@/lib/blog/blog-comments.contract';
import {
  BLOG_COMMENTS_PAGE_SIZE,
  createBlogCommentSchema,
} from '@/lib/blog/blog-comments-schema';
import {
  commentBlockedResponse,
  commentInclude,
  findAnnouncementPost,
  toCommentView,
} from '@/lib/blog/blog-comments.server';

// Per-viewer (`canDelete`), so a shared cache must never hold it.
const HEADERS =
  {
    'Cache-Control':
      'private, no-store',
  };

/**
 * GET  /api/blog/$slug/comments — the discussion under a sitewide announcement, oldest first.
 * POST /api/blog/$slug/comments — add a comment. Only announcement posts have a discussion (404 otherwise).
 */
export const route = apiRoute('/api/blog/$slug/comments',
    {
      GET: implement(
        listBlogCommentsApi,
        {
          auth: 'optional',
          rateLimit:
            'read',
          microCache: false,
        },
        async ({
          params,
          userId,
          isAdmin,
        }) => {
          const post =
            await findAnnouncementPost(
              params.slug,
            );
          if (
            !post
          )
            return Response.json(
              {
                error:
                  'Not found',
              },
              {
                status: 404,
              },
            );
          const where =
            {
              postId:
                post.id,
              deletedAt:
                null,
            };
          const [
            rows,
            total,
          ] =
            await Promise.all(
              [
                prisma.blogComment.findMany(
                  {
                    where,
                    orderBy:
                      [
                        {
                          createdAt:
                            'asc',
                        },
                        {
                          id: 'asc',
                        },
                      ],
                    take: BLOG_COMMENTS_PAGE_SIZE,
                    include:
                      commentInclude,
                  },
                ),
                prisma.blogComment.count(
                  {
                    where,
                  },
                ),
              ],
            );
          const viewer =
            userId
              ? {
                  id: userId,
                  isAdmin,
                }
              : null;
          return Response.json(
            {
              comments:
                rows.map(
                  (
                    r,
                  ) =>
                    toCommentView(
                      r,
                      viewer,
                    ),
                ),
              total,
            },
            {
              headers:
                HEADERS,
            },
          );
        },
      ),
      POST: implement(
        createBlogCommentApi,
        {
          rateLimit:
            'write',
          body: createBlogCommentSchema,
        },
        async ({
          params,
          userId,
          isAdmin,
          body,
        }) => {
          const blocked =
            await commentBlockedResponse(
              userId,
            );
          if (
            blocked
          )
            return blocked;
          const post =
            await findAnnouncementPost(
              params.slug,
            );
          if (
            !post
          )
            return Response.json(
              {
                error:
                  'Not found',
              },
              {
                status: 404,
              },
            );
          const row =
            await prisma.blogComment.create(
              {
                data: {
                  postId:
                    post.id,
                  userId,
                  content:
                    body.content,
                },
                include:
                  commentInclude,
              },
            );
          void screenNewContent(
            {
              entityType:
                'blog-comment',
              entityId:
                row.id,
              authorId:
                userId,
              text: row.content,
            },
          );
          return Response.json(
            {
              comment:
                toCommentView(
                  row,
                  {
                    id: userId,
                    isAdmin,
                  },
                ),
            },
            {
              status: 201,
            },
          );
        },
      ),
    },
  );
