import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { MESSAGE_MAX_LENGTH } from '@/lib/messages/edit-policy';
import { editDirectMessage } from '@/lib/messages/mutations.server';

/**
 * POST /api/messages/$conversationId/edit — edit one of your own messages.
 *
 * The 15-minute window, the sender check and the prior-text snapshot all live in
 * `lib/messages/mutations.server.ts`; this route only carries the request. The
 * client's own window check is a courtesy so the menu does not offer an action
 * that will fail — it is not the gate.
 *
 * `messageId` travels in the body rather than the path, matching the sibling
 * `react` route, so the conversation stays the only path parameter and the
 * participant check has one shape everywhere.
 */

const bodySchema = z.object({
  messageId: z.string().min(1).max(64),
  content: z.string().max(MESSAGE_MAX_LENGTH),
});

export const Route = createFileRoute('/api/messages/$conversationId/edit')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 30, windowMs: 60_000, prefix: 'dm:edit', scope: 'user' },
          body: bodySchema,
        },
        async ({ params, userId, body }) => {
          const result = await editDirectMessage({
            conversationId: params.conversationId,
            messageId: body.messageId,
            userId,
            content: body.content,
          });

          if (!result.ok) {
            return Response.json({ error: result.error }, { status: result.status });
          }

          return Response.json({ success: true, message: result.message });
        },
      ),
    },
  },
});
