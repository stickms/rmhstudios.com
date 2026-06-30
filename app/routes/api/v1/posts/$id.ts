import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { apiAuthorSelect, serializePublicPost } from '@/lib/api/serializers.server';
import { deleteOwnPost } from '@/lib/social/engagement.server';

/**
 * GET    /api/v1/posts/{id} — a single post (public, or your own).
 * DELETE /api/v1/posts/{id} — soft-delete one of your own posts.
 */
export const Route = createFileRoute('/api/v1/posts/$id')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const post = await prisma.rMHark.findUnique({
              where: { id: params.id },
              select: {
                id: true, userId: true, content: true, audience: true, createdAt: true, deletedAt: true,
                likeCount: true, commentCount: true, repostCount: true, viewCount: true, imageUrls: true,
                user: { select: apiAuthorSelect },
              },
            });
            // Visible only if it exists, isn't deleted, and is public or owned.
            if (!post || post.deletedAt || (post.audience !== 'PUBLIC' && post.userId !== userId)) {
              return error('not_found', 'Post not found.', 404);
            }
            return json(serializePublicPost(post));
          },
          { scope: 'read:posts' }
        ),

      DELETE: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, error, noContent }) => {
            const result = await deleteOwnPost(userId, params.id);
            if (!result.found) return error('not_found', 'Post not found.', 404);
            if (result.forbidden) return error('forbidden', 'You can only delete your own posts.', 403);
            return noContent();
          },
          { scope: 'write:posts', idempotent: true }
        ),
    },
  },
});
