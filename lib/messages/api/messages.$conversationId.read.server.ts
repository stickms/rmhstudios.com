import { refusalBody } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { markConversationReadApi } from '@/lib/messages/message-actions.contract';
import { prisma } from '@/lib/prisma.server';
import { findDm } from '@/lib/chat/chat.server';
import { notifyUser } from '@/lib/message-events';
import { redisDel } from '@/lib/redis.server';
import { hiddenFromRecipient } from '@/lib/messages/requests';
import { getPairPrivacy } from '@/lib/chat-plus/receipts.server';

/** POST /api/messages/[conversationId]/read — mark messages as read */

export const route = apiRoute('/api/messages/$conversationId/read', {
  POST: implement(markConversationReadApi, {}, async ({ params, session }) => {
    const { conversationId } = params;
    const userId = session.user.id;

    // Verify user is a participant
    const conversation = await findDm(conversationId);

    if (!conversation) {
      return Response.json({ ...refusalBody('CONVERSATION_NOT_FOUND') }, { status: 404 });
    }

    if (conversation.participantOneId !== userId && conversation.participantTwoId !== userId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // A message request waiting for this viewer is read from the Requests folder; nothing here marks it read (s04-16).
    if (hiddenFromRecipient(conversation.request, userId)) {
      return Response.json({ ...refusalBody('CONVERSATION_NOT_FOUND') }, { status: 404 });
    }

    const marked = await prisma.chatMessage.updateMany({
      where: {
        chatId: conversationId,
        senderId: { not: userId },
        read: false,
      },
      data: { read: true },
    });

    // The unread badge reads a Redis counter that this write bypassed, so it kept
    // the old number for up to its 60s TTL. Drop it; the next read recounts.
    if (marked.count > 0) await redisDel(`dm:unread:${userId}`).catch(() => {});

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

    return { success: true as const };
  }),
});
