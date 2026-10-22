import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { canReadThread } from '@/lib/feed/audience.server';
import { isLocked } from '@/lib/feed/map-feed-item.server';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { apiAuthorSelect, serializePublicPost } from '@/lib/api/serializers.server';
import { deleteOwnPost } from '@/lib/social/engagement.server';

/**
 * GET    /api/v1/posts/{id} — a single post the caller may read (403 while it is a
 *        priced post they have not unlocked).
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
                id: true, userId: true, content: true, audience: true, communityId: true, createdAt: true, deletedAt: true,
                likeCount: true, commentCount: true, repostCount: true, viewCount: true, imageUrls: true,
                unlockPrice: true, unlocks: { where: { userId }, select: { id: true } },
                user: { select: apiAuthorSelect },
              },
            });
            // Same rule as every other post read: exists, not deleted, audience,
            // not by a hidden author, and a private community's posts are members-only.
            if (!post || !(await canReadThread(post, userId))) {
              return error('not_found', 'Post not found.', 404);
            }
            // Audience access is not paid access: a priced post's body and images are
            // for its author and for viewers who unlocked it, as on the web reader.
            if (isLocked(post, userId)) {
              return error('forbidden', 'This post is locked. Unlock it on RMH Studios to read it.', 403);
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
