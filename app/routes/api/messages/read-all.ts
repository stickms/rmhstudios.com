import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { notifyUser } from '@/lib/message-events';
import { redisDel } from '@/lib/redis.server';

/** POST /api/messages/read-all — mark every conversation's messages as read */

export const Route = createFileRoute('/api/messages/read-all')({
  server: {
    handlers: {
      POST: defineHandler({}, async ({ session }) => {
        const userId = session.user.id;

        // One statement: Postgres joins through the conversation relation instead
        // of reading every conversation id first and shipping them back as an IN list.
        const marked = await prisma.directMessage.updateMany({
          where: {
            senderId: { not: userId },
            read: false,
            conversation: { OR: [{ participantOneId: userId }, { participantTwoId: userId }] },
          },
          data: { read: true },
        });

        // The unread badge reads a Redis counter (api/messages/stream, unread-count).
        // Marking everything read left it at its old value for up to its 60s TTL,
        // so the badge kept showing messages that were already read. Dropping the key
        // makes the next read recount exactly.
        if (marked.count > 0) await redisDel(`dm:unread:${userId}`).catch(() => {});

        // Notify the current user so their unread count updates.
        notifyUser(userId);

        return Response.json({ success: true });
      }),
    },
  },
});
