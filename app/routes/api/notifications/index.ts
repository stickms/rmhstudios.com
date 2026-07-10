import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { listNotifications } from '@/lib/notifications.server';

/**
 * GET /api/notifications — the current user's notifications, newest first.
 * Cursor pagination via ?cursor=<id>&limit=<n>. Returns { items, nextCursor }.
 */
export const Route = createFileRoute('/api/notifications/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const url = new URL(request.url);
          const cursor = url.searchParams.get('cursor');
          const limit = Number(url.searchParams.get('limit')) || 20;
          const result = await listNotifications(session.user.id, { cursor, limit });
          return Response.json(result);
        } catch (error) {
          console.error('List notifications error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
