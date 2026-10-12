import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { notifyUser } from '@/lib/message-events';
import { getPairPrivacy } from '@/lib/chat-plus/receipts.server';

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

        const marked = await prisma.directMessage.updateMany({
          where: {
            conversationId,
            senderId: { not: userId },
            read: false,
          },
          data: { read: true },
        });

        // Notify the current user so their unread count updates
        notifyUser(userId);

        // M8: tell the sender their messages were seen — unless either side has
        // read receipts off (reciprocal), in which case the signal never leaves.
        const otherId =
          conversation.participantOneId === userId
            ? conversation.participantTwoId
            : conversation.participantOneId;
        if (marked.count > 0 && otherId !== userId) {
          const privacy = await getPairPrivacy(conversationId, [
            conversation.participantOneId,
            conversation.participantTwoId,
          ]);
          if (!privacy.receiptsHidden) {
            notifyUser(otherId, {
              type: 'chat-update',
              update: { kind: 'dm', chatId: conversationId, op: 'read' },
            });
          }
        }

        return Response.json({ success: true });
      }),
    },
  },
});
