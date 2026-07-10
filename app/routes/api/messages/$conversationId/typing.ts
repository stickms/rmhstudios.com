import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { notifyUser } from "@/lib/message-events";
import { z } from "zod";

const typingSchema = z.object({ isTyping: z.boolean() });

/** POST /api/messages/[conversationId]/typing — broadcast a typing indicator to the other participant */

export const Route = createFileRoute('/api/messages/$conversationId/typing')({
  server: {
    handlers: {
  POST: async ({ params, request }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = typingSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "Invalid input" }, { status: 400 });
    }

    const { conversationId } = params;
    const userId = session.user.id;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { participantOneId: true, participantTwoId: true },
    });

    if (!conversation) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }

    if (
      conversation.participantOneId !== userId &&
      conversation.participantTwoId !== userId
    ) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const otherUserId =
      conversation.participantOneId === userId
        ? conversation.participantTwoId
        : conversation.participantOneId;

    notifyUser(otherUserId, {
      type: "typing",
      typing: { conversationId, senderId: userId, isTyping: parsed.data.isTyping },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Typing notify error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
