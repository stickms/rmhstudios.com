import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { typingApi } from '@/lib/messages/message-actions.contract';
import { typingBody } from '@/lib/messages/message-actions-schema';
import { prisma } from '@/lib/prisma.server';
import { notifyUser } from '@/lib/message-events';
import { getPairPrivacy } from '@/lib/chat-plus/receipts.server';

/** POST /api/messages/[conversationId]/typing — broadcast a typing indicator to the other participant */

export const route = apiRoute('/api/messages/$conversationId/typing', {
  POST: implement(typingApi, { body: typingBody }, async ({ params, session, body }) => {
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

    // M8: typing indicators are reciprocal. If either participant has them
    // switched off for this conversation, nothing is published at all — the
    // gate is here at the source, not in the receiving client.
    if (otherUserId !== userId) {
      const privacy = await getPairPrivacy(conversationId, [
        conversation.participantOneId,
        conversation.participantTwoId,
      ]);
      if (privacy.typingHidden) return { success: true as const, suppressed: true as const };
    }

    notifyUser(otherUserId, {
      type: 'typing',
      typing: { conversationId, senderId: userId, isTyping: body.isTyping },
    });

    return { success: true as const };
  }),
});
