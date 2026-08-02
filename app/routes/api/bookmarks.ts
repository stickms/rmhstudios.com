import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listBookmarks } from '@/lib/bookmarks.server';

/** GET /api/bookmarks — the current user's bookmarked posts (newest-saved first). */
export const Route = createFileRoute('/api/bookmarks')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ request, session }) => {
        const url = new URL(request.url);
        const cursor = url.searchParams.get('cursor');
        const limit = parseInt(url.searchParams.get('limit') || '20');
        const result = await listBookmarks(session.user.id, { cursor, limit });
        return Response.json(result);
      }),
    },
  },
});
