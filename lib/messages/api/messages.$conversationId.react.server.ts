import { refusalBody } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { reactMessageApi } from '@/lib/messages/message-actions.contract';
import { reactMessageBody } from '@/lib/messages/message-actions-schema';
import { prisma } from '@/lib/prisma.server';
import { findDm } from '@/lib/chat/chat.server';
import { notifyUser } from '@/lib/message-events';
import { isValidReactionEmoji } from '@/lib/social/reactions';
import { hiddenFromRecipient, requestOut } from '@/lib/messages/requests';
import { toggleDmReaction } from '@/lib/social/reactions.server';

/** POST /api/messages/$conversationId/react — toggle an emoji reaction on a DM. */
export const route = apiRoute('/api/messages/$conversationId/react', {
  POST: implement(
    reactMessageApi,
    { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'reaction' } },
    async ({ request, params, session }) => {
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

      // s04-16: a message request waiting for this viewer is not theirs to react to, and the sender's
      // reactions inside a request that is out never reach the recipient.
      if (hiddenFromRecipient(conversation.request, userId)) {
        return Response.json({ ...refusalBody('CONVERSATION_NOT_FOUND') }, { status: 404 });
      }
      const requestOpen = requestOut(conversation.request, userId);

      const body = await request.json().catch(() => null);
      const parsed = reactMessageBody.safeParse(body);
      if (!parsed.success || !isValidReactionEmoji(parsed.data.emoji)) {
        return Response.json({ ...refusalBody('MESSAGE_EMOJI_INVALID') }, { status: 400 });
      }

      const result = await toggleDmReaction(
        userId,
        conversationId,
        parsed.data.messageId,
        parsed.data.emoji,
      );
      if (!result.found) return Response.json({ ...refusalBody('MESSAGE_NOT_FOUND') }, { status: 404 });

      const otherParticipantId =
        conversation.participantOneId === userId
          ? conversation.participantTwoId
          : conversation.participantOneId;

      if (!requestOpen) notifyUser(otherParticipantId, {
        type: 'message-reaction',
        conversationId,
        messageId: parsed.data.messageId,
        reactions: result.rows,
      });

      return { success: true as const, reacted: result.reacted, reactions: result.rows };
    },
  ),
});
