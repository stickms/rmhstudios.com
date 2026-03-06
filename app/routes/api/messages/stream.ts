import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  subscribeUser,
  type MessageNotification,
} from "@/lib/message-events";

async function getUnreadCount(userId: string): Promise<number> {
  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [
        { participantOneId: userId },
        { participantTwoId: userId },
      ],
    },
    select: { id: true },
  });

  if (conversations.length === 0) return 0;

  return prisma.directMessage.count({
    where: {
      conversationId: { in: conversations.map((c) => c.id) },
      senderId: { not: userId },
      read: false,
    },
  });
}

/** GET /api/messages/stream — SSE stream for real-time messages & unread count */

export const Route = createFileRoute('/api/messages/stream')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Cleanup function stored in closure so cancel() can call it
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (eventName: string, data: string) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${eventName}\ndata: ${data}\n\n`)
          );
        } catch {
          // Stream closed
        }
      };

      const sendUnreadCount = async () => {
        try {
          const count = await getUnreadCount(userId);
          send("unread", JSON.stringify({ count }));
        } catch {
          send("unread", JSON.stringify({ count: 0 }));
        }
      };

      // Send initial unread count
      await sendUnreadCount();

      // Listen for notifications
      const unsubscribe = subscribeUser(
        userId,
        async (event: MessageNotification) => {
          if (event.type === "new-message") {
            send("new-message", JSON.stringify(event.message));
          }
          // Always send updated unread count
          await sendUnreadCount();
        }
      );

      // Send heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      // Auto-close after 5 min to avoid leaks; client will reconnect
      const timeout = setTimeout(() => {
        unsubscribe();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }, 5 * 60_000);

      cleanup = () => {
        unsubscribe();
        clearInterval(heartbeat);
        clearTimeout(timeout);
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
},
    },
  },
});
