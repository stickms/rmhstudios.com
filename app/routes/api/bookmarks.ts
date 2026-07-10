import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { listBookmarks } from '@/lib/bookmarks.server';

/** GET /api/bookmarks — the current user's bookmarked posts (newest-saved first). */
export const Route = createFileRoute('/api/bookmarks')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const url = new URL(request.url);
          const cursor = url.searchParams.get('cursor');
          const limit = parseInt(url.searchParams.get('limit') || '20');
          const result = await listBookmarks(session.user.id, { cursor, limit });
          return Response.json(result);
        } catch (error) {
          console.error('Bookmarks fetch error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
