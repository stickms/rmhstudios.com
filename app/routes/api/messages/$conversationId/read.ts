import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { notifyUser } from '@/lib/message-events';

/** POST /api/messages/[conversationId]/read — mark messages as read */

export const Route = createFileRoute('/api/messages/$conversationId/read')({
  server: {
    handlers: {
      POST: defineHandler({}, async ({ params, session }) => {
        const { conversationId } = params;
        const userId = session.user.id;

        // Verify user is a participant
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { participantOneId: true, participantTwoId: true },
        });

        if (!conversation) {
          return Response.json({ error: 'Conversation not found' }, { status: 404 });
        }

        if (conversation.participantOneId !== userId && conversation.participantTwoId !== userId) {
          return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        await prisma.directMessage.updateMany({
          where: {
            conversationId,
            senderId: { not: userId },
            read: false,
          },
          data: { read: true },
        });

        // Notify the current user so their unread count updates
        notifyUser(userId);

        return Response.json({ success: true });
      }),
    },
  },
});
