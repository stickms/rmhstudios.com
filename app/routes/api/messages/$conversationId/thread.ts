import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
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

const querySchema = z.object({
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const Route = createFileRoute('/api/messages/$conversationId/thread')({
  server: {
    handlers: {
      GET: defineHandler(
        { rateLimit: 'read', query: querySchema },
        async ({ params, userId, query }) => {
          const page = await loadThreadPage({
            conversationId: params.conversationId,
            userId,
            cursor: query.cursor ?? null,
            limit: query.limit,
          });
          if (!page) return Response.json({ error: 'Conversation not found' }, { status: 404 });
          return Response.json(page);
        },
      ),
    },
  },
});
