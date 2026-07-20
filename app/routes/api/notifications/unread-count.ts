import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { getUnreadNotificationCount } from '@/lib/notifications.server';

/** GET /api/notifications/unread-count — number of unread notifications. */
export const Route = createFileRoute('/api/notifications/unread-count')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ count: 0 });
          }
          // Reads the denormalized Redis counter (kept warm by notification
          // create/remove), falling back to a COUNT on a miss / without Redis.
          const count = await getUnreadNotificationCount(session.user.id);
          return Response.json(
            { count },
            {
              headers: { 'Cache-Control': 'no-store' },
            },
          );
        } catch (error) {
          console.error('Unread notifications count error:', error);
          return Response.json({ count: 0 });
        }
      },
    },
  },
});
