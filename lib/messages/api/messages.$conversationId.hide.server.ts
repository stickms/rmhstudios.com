import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { hideMessageApi } from '@/lib/messages/message-actions.contract';
import { hideMessageBody } from '@/lib/messages/message-actions-schema';
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

export const route = apiRoute('/api/messages/$conversationId/hide', {
  POST: implement(
    hideMessageApi,
    {
      rateLimit: { limit: 60, windowMs: 60_000, prefix: 'dm:hide', scope: 'user' },
      body: hideMessageBody,
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

      return { success: true as const, hidden: result.hidden };
    },
  ),
});
