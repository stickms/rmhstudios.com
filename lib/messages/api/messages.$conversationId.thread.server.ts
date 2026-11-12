import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { messageThreadApi } from '@/lib/messages/message-actions.contract';
import { threadQuery } from '@/lib/messages/message-actions-schema';
import { loadThreadPage } from '@/lib/messages/mutations.server';

/**
 * GET /api/messages/$conversationId/thread — the viewer-scoped message page.
 *
 * A separate route from the older `GET /api/messages/$conversationId`, which
 * predates H1 and returns raw columns: it has no notion of a tombstone, so it
 * would hand a participant the text of a message that was unsent, and no notion
 * of `DirectMessageHide`, so "delete for me" would undo itself on the next
 * reload. Redaction and hiding live on the read path
 * (`lib/messages/message-view.ts`), and this is the read path the client uses.
 *
 * The old route is left in place untouched for any consumer still on it.
 */

export const route = apiRoute('/api/messages/$conversationId/thread', {
  GET: implement(
    messageThreadApi,
    { rateLimit: 'read', query: threadQuery },
    async ({ params, userId, query }) => {
      const page = await loadThreadPage({
        conversationId: params.conversationId,
        userId,
        cursor: query.cursor ?? null,
        limit: query.limit,
      });
      if (!page) return Response.json({ error: 'Conversation not found' }, { status: 404 });
      return page;
    },
  ),
});
