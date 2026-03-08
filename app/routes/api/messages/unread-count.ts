import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

    // Get all conversation IDs where user is a participant
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { participantOneId: userId },
          { participantTwoId: userId },
        ],
      },
      select: { id: true },
    });

    if (conversations.length === 0) {
      return Response.json({ count: 0 });
    }

    const count = await prisma.directMessage.count({
      where: {
        conversationId: { in: conversations.map((c) => c.id) },
        senderId: { not: userId },
        read: false,
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
