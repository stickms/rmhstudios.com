import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { unsendMessageApi } from '@/lib/messages/message-actions.contract';
import { unsendMessageBody } from '@/lib/messages/message-actions-schema';
import { unsendDirectMessage } from '@/lib/messages/mutations.server';

/**
 * POST /api/messages/$conversationId/unsend — retract a message for everyone.
 *
 * Sender only, no time limit. The row is **tombstoned, never removed**: the
 * recipient sees "This message was deleted" instead of nothing, and a moderator
 * reviewing a `ContentReport` against it can still read what was reported. See
 * `lib/messages/message-view.ts` for why both of those are requirements rather
 * than preferences.
 */

export const Route = createFileRoute('/api/messages/$conversationId/unsend')({
  server: {
    handlers: {
      POST: implement(
        unsendMessageApi,
        {
          rateLimit: { limit: 30, windowMs: 60_000, prefix: 'dm:unsend', scope: 'user' },
          body: unsendMessageBody,
        },
        async ({ params, userId, body }) => {
          const result = await unsendDirectMessage({
            conversationId: params.conversationId,
            messageId: body.messageId,
            userId,
          });

          if (!result.ok) {
            return Response.json({ error: result.error }, { status: result.status });
          }

          return { success: true as const, message: result.message };
        },
      ),
    },
  },
});
