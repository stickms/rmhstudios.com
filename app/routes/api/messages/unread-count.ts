import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { redisEnabled, redisGetJSON, redisSetJSON } from "@/lib/redis.server";
/** GET /api/messages/unread-count — total unread message count */

/** Keep in sync with the writer in api/messages/$conversationId.ts. */
const DM_UNREAD_TTL_MS = 60_000;

/** Single round-trip: let Postgres join through the conversation relation
 * instead of fetching every conversation id and shipping it back in an IN(...)
 * list. */
function countUnreadFromDb(userId: string): Promise<number> {
  return prisma.directMessage.count({
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
}

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

    // This endpoint is polled every 15s per active client (lib/useUnreadCount.ts).
    // Read the denormalized Redis counter (kept warm by message-send/mark-read),
    // lazily backfilling from a real COUNT with a short TTL on a miss, so the
    // COUNT only runs about once per TTL per user instead of on every poll.
    let count: number;
    if (redisEnabled()) {
      const key = `dm:unread:${userId}`;
      const cached = await redisGetJSON<number>(key);
      if (typeof cached === "number" && cached >= 0) {
        count = cached;
      } else {
        count = await countUnreadFromDb(userId);
        await redisSetJSON(key, count, DM_UNREAD_TTL_MS);
      }
    } else {
      count = await countUnreadFromDb(userId);
    }

    return Response.json({ count });
  } catch (error) {
    console.error("Unread count error:", error);
    return Response.json({ count: 0 });
  }
},
    },
  },
});
