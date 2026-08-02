import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { notifyUser } from '@/lib/message-events';
import { z } from 'zod';

const typingSchema = z.object({ isTyping: z.boolean() });

/** POST /api/messages/[conversationId]/typing — broadcast a typing indicator to the other participant */

export const Route = createFileRoute('/api/messages/$conversationId/typing')({
  server: {
    handlers: {
      POST: defineHandler({ body: typingSchema }, async ({ params, session, body }) => {
        const { conversationId } = params;
        const userId = session.user.id;

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

        const otherUserId =
          conversation.participantOneId === userId
            ? conversation.participantTwoId
            : conversation.participantOneId;

        notifyUser(otherUserId, {
          type: 'typing',
          typing: { conversationId, senderId: userId, isTyping: body.isTyping },
        });

        return Response.json({ success: true });
      }),
    },
  },
});
