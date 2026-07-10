import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';

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
          const count = await prisma.notification.count({
            where: { userId: session.user.id, read: false },
          });
          return Response.json({ count }, {
            headers: { 'Cache-Control': 'no-store' },
          });
        } catch (error) {
          console.error('Unread notifications count error:', error);
          return Response.json({ count: 0 });
        }
      },
    },
  },
});
