import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
/** GET /api/messages/unread-count — total unread message count */

export const Route = createFileRoute('/api/messages/unread-count')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ count: 0 });
    }

    const userId = session.user.id;

    // Single round-trip: let Postgres join through the conversation relation
    // instead of fetching every conversation id and shipping it back in an
    // IN (...) list. This endpoint is polled every 15s per active client
    // (lib/useUnreadCount.ts), so halving its query count matters at scale.
    const count = await prisma.directMessage.count({
      where: {
        senderId: { not: userId },
        read: false,
        conversation: {
          OR: [
            { participantOneId: userId },
            { participantTwoId: userId },
          ],
        },
      },
    });

    return Response.json({ count });
  } catch (error) {
    console.error("Unread count error:", error);
    return Response.json({ count: 0 });
  }
},
    },
  },
});
