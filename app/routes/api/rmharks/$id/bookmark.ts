import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { toggleBookmark } from '@/lib/social/engagement.server';
import { bookmarkPostApi } from '@/lib/feed/rmhark-actions.contract';

/** POST /api/rmharks/$id/bookmark — toggle a bookmark on a post. */
export const Route = createFileRoute('/api/rmharks/$id/bookmark')({
  server: {
    handlers: {
      POST: implement(
        bookmarkPostApi,
        { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'rmhark-bookmark' } },
        async ({ params, session }) => {
          const { id } = params;
          const result = await toggleBookmark(session.user.id, id);
          if (!result.found) return Response.json({ error: 'Post not found' }, { status: 404 });
          return Response.json({ success: true, bookmarked: result.bookmarked });
        },
      ),
    },
  },
});
