import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { setBookmark } from '@/lib/social/engagement.server';

/**
 * POST   /api/v1/posts/{id}/bookmark — bookmark a post (idempotent).
 * DELETE /api/v1/posts/{id}/bookmark — remove a bookmark (idempotent).
 */
export const Route = createFileRoute('/api/v1/posts/$id/bookmark')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      POST: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const r = await setBookmark(userId, params.id, true);
            if (!r.found) return error('not_found', 'Post not found.', 404);
            return json({ bookmarked: r.bookmarked });
          },
          { scope: 'write:bookmarks', idempotent: true }
        ),

      DELETE: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json }) => {
            const r = await setBookmark(userId, params.id, false);
            return json({ bookmarked: r.bookmarked });
          },
          { scope: 'write:bookmarks', idempotent: true }
        ),
    },
  },
});
