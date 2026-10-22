import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { ensureSavedConversation, getSavedSummary } from '@/lib/chat-plus/saved.server';

/**
 * Saved Messages (M2) — a note-to-self conversation.
 * GET  — the viewer's summary (id + last note), or `{ saved: null }` if they have
 *        never opened it. Does not create anything.
 * POST — open it, creating the conversation on first use. Returns its id.
 */
export const Route = createFileRoute('/api/messages/saved')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(
          { saved: await getSavedSummary(userId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      POST: defineHandler({ rateLimit: 'write', allowEmptyBody: true }, async ({ userId }) =>
        Response.json({ conversationId: await ensureSavedConversation(userId) }),
      ),
    },
  },
});
