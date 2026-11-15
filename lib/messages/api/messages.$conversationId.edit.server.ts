import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { editMessageApi } from '@/lib/messages/message-actions.contract';
import { editMessageBody } from '@/lib/messages/message-actions-schema';
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

export const route = apiRoute('/api/messages/$conversationId/edit', {
  POST: implement(
    editMessageApi,
    {
      rateLimit: { limit: 30, windowMs: 60_000, prefix: 'dm:edit', scope: 'user' },
      body: editMessageBody,
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

      return { success: true as const, message: result.message };
    },
  ),
});
