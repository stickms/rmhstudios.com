import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { notifyUser } from '@/lib/message-events';
import { isValidReactionEmoji } from '@/lib/social/reactions';
import { toggleDmReaction } from '@/lib/social/reactions.server';

const reactSchema = z.object({
  messageId: z.string(),
  emoji: z.string().min(1).max(32),
});

/** POST /api/messages/$conversationId/react — toggle an emoji reaction on a DM. */
export const Route = createFileRoute('/api/messages/$conversationId/react')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'reaction' } },
        async ({ request, params, session }) => {
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

          if (
            conversation.participantOneId !== userId &&
            conversation.participantTwoId !== userId
          ) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }

          const body = await request.json().catch(() => null);
          const parsed = reactSchema.safeParse(body);
          if (!parsed.success || !isValidReactionEmoji(parsed.data.emoji)) {
            return Response.json({ error: 'Invalid emoji' }, { status: 400 });
          }

          const result = await toggleDmReaction(
            userId,
            conversationId,
            parsed.data.messageId,
            parsed.data.emoji,
          );
          if (!result.found) return Response.json({ error: 'Message not found' }, { status: 404 });

          const otherParticipantId =
            conversation.participantOneId === userId
              ? conversation.participantTwoId
              : conversation.participantOneId;

          notifyUser(otherParticipantId, {
            type: 'message-reaction',
            conversationId,
            messageId: parsed.data.messageId,
            reactions: result.rows,
          });

          return Response.json({ success: true, reacted: result.reacted, reactions: result.rows });
        },
      ),
    },
  },
});
