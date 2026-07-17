import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { redisEnabled, redisGetJSON, redisSetJSON } from "@/lib/redis.server";
import {
  subscribeUser,
  type MessageNotification,
} from "@/lib/message-events";

/** Keep in sync with the writer in api/messages/$conversationId.ts. */
const DM_UNREAD_TTL_MS = 60_000;

/** Single-query unread count (Postgres joins through the conversation relation
 * instead of shipping every conversation id back in an IN(...) list). */
function countUnreadFromDb(userId: string): Promise<number> {
  return prisma.directMessage.count({
    where: {
      senderId: { not: userId },
      read: false,
      conversation: {
        OR: [{ participantOneId: userId }, { participantTwoId: userId }],
      },
    },
  });
}

/**
 * Denormalized DM-unread read path. The stream previously ran this COUNT on
 * EVERY delivered event (O(conversations) per message). Now it reads a Redis
 * counter kept warm by message-send/mark-read, lazily backfilling from a real
 * COUNT (with a short TTL) on a miss. Falls back to the direct COUNT whenever
 * Redis is unavailable.
 */
async function getUnreadCount(userId: string): Promise<number> {
  if (redisEnabled()) {
    const key = `dm:unread:${userId}`;
    const cached = await redisGetJSON<number>(key);
    if (typeof cached === "number" && cached >= 0) return cached;
    const count = await countUnreadFromDb(userId);
    await redisSetJSON(key, count, DM_UNREAD_TTL_MS);
    return count;
  }
  return countUnreadFromDb(userId);
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
          if (event.type === "typing") {
            // Typing is ephemeral and does not affect unread counts.
            send("typing", JSON.stringify(event.typing));
            return;
          }
          if (event.type === "message-reaction") {
            // Reactions don't affect unread counts either.
            send("message-reaction", JSON.stringify({
              conversationId: event.conversationId,
              messageId: event.messageId,
              reactions: event.reactions,
            }));
            return;
          }
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
