import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { setPostLike } from '@/lib/social/engagement.server';

/**
 * POST   /api/v1/posts/{id}/like — like a post (idempotent).
 * DELETE /api/v1/posts/{id}/like — remove your like (idempotent).
 */
export const Route = createFileRoute('/api/v1/posts/$id/like')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      POST: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const r = await setPostLike(userId, params.id, true);
            if (!r.found) return error('not_found', 'Post not found.', 404);
            return json({ liked: r.liked, likeCount: r.likeCount });
          },
          { scope: 'write:likes', idempotent: true }
        ),

      DELETE: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const r = await setPostLike(userId, params.id, false);
            if (!r.found) return error('not_found', 'Post not found.', 404);
            return json({ liked: r.liked, likeCount: r.likeCount });
          },
          { scope: 'write:likes', idempotent: true }
        ),
    },
  },
});
