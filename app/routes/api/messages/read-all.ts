import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { notifyUser } from "@/lib/message-events";

/** POST /api/messages/read-all — mark every conversation's messages as read */

export const Route = createFileRoute('/api/messages/read-all')({
  server: {
    handlers: {
  POST: async ({ request }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // All conversations the user participates in.
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
      return Response.json({ success: true });
    }

    await prisma.directMessage.updateMany({
      where: {
        conversationId: { in: conversations.map((c) => c.id) },
        senderId: { not: userId },
        read: false,
      },
      data: { read: true },
    });

    // Notify the current user so their unread count updates.
    notifyUser(userId);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Mark all read error:", error);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
},
    },
  },
});
