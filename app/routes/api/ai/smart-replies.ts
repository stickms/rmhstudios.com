import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { isAITextConfigured, suggestSmartReplies } from '@/lib/ai/text.server';

/**
 * POST /api/ai/smart-replies — three one-tap replies for a DM conversation.
 *
 * The conversation is read HERE, from the database, rather than accepted from
 * the request the way `/api/ai/message-suggest` accepts its context. That route
 * is fed by a composer the user is actively typing into, so its context is
 * already on their screen; this one is a button that can be pressed on any
 * conversation id, so taking the transcript from the caller would let a signed-in
 * user hand the model 20 lines of text attributed to someone else's chat. The
 * participant check below is what makes the id safe to act on.
 *
 * Fail-soft: an unconfigured key or an unusable model response returns
 * `{ replies: [] }`, and the UI renders no chips at all.
 */
const schema = z.object({ conversationId: z.string().min(1).max(64) });

/** How much history a reply suggestion is drawn from. */
const CONTEXT_MESSAGES = 10;

export const Route = createFileRoute('/api/ai/smart-replies')({
  server: {
    handlers: {
      POST: defineHandler({ rateLimit: 'ai', body: schema }, async ({ userId, body }) => {
        if (!isAITextConfigured()) return Response.json({ replies: [] });

        const conversation = await prisma.conversation.findFirst({
          where: {
            id: body.conversationId,
            OR: [{ participantOneId: userId }, { participantTwoId: userId }],
          },
          select: {
            id: true,
            messages: {
              orderBy: { createdAt: 'desc' },
              take: CONTEXT_MESSAGES,
              select: {
                content: true,
                senderId: true,
                sender: { select: { name: true, username: true } },
              },
            },
          },
        });
        if (!conversation) return Response.json({ error: 'Not found' }, { status: 404 });

        // Newest-first from the query (that's the indexed direction); the model
        // reads a transcript, so flip it back to chronological.
        const context = conversation.messages
          .slice()
          .reverse()
          // Media-only messages carry no text to reply to, and an empty line
          // just spends context — but they are dropped, not skipped over, so
          // the remaining order is still true.
          .filter((m) => m.content.trim().length > 0)
          .map((m) => ({
            author:
              m.senderId === userId
                ? 'Me'
                : (m.sender.name || m.sender.username || 'Them').slice(0, 40),
            content: m.content.slice(0, 500),
          }));

        // Nothing said yet, or the last thing said was the user's own message —
        // there is no incoming message to reply to, so chips would be noise.
        if (context.length === 0 || context[context.length - 1].author === 'Me') {
          return Response.json({ replies: [] });
        }

        const replies = await suggestSmartReplies(context, { me: 'Me' });
        return Response.json({ replies });
      }),
    },
  },
});
