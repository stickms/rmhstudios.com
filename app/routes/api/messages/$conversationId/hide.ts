import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { setMessageHidden } from '@/lib/messages/mutations.server';

/**
 * POST /api/messages/$conversationId/hide — "delete for me".
 *
 * Writes a `DirectMessageHide (messageId, userId)` row, which is the only shape
 * that lets the two sides of a conversation legitimately disagree about what is
 * in it: a column on the shared row would delete the message for both, which is
 * unsend, a different feature with a different rule (sender only).
 *
 * Deliberately publishes nothing on the realtime bus — by definition nothing
 * changed for the other participant.
 */

const bodySchema = z.object({
  messageId: z.string().min(1).max(64),
  /** `false` restores it, so an accidental hide is recoverable. */
  hidden: z.boolean().default(true),
});

export const Route = createFileRoute('/api/messages/$conversationId/hide')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 60, windowMs: 60_000, prefix: 'dm:hide', scope: 'user' },
          body: bodySchema,
        },
        async ({ params, userId, body }) => {
          const result = await setMessageHidden({
            conversationId: params.conversationId,
            messageId: body.messageId,
            userId,
            hidden: body.hidden,
          });

          if (!result.ok) {
            return Response.json({ error: result.error }, { status: result.status });
          }

          return Response.json({ success: true, hidden: result.hidden });
        },
      ),
    },
  },
});
