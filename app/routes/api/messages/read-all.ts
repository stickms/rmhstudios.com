import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { notifyUser } from '@/lib/message-events';

/** POST /api/messages/read-all — mark every conversation's messages as read */

export const Route = createFileRoute('/api/messages/read-all')({
  server: {
    handlers: {
      POST: defineHandler({}, async ({ session }) => {
        const userId = session.user.id;

        // All conversations the user participates in.
        const conversations = await prisma.conversation.findMany({
          where: {
            OR: [{ participantOneId: userId }, { participantTwoId: userId }],
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
      }),
    },
  },
});
