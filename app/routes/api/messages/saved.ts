import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { getSavedMessagesApi, openSavedMessagesApi } from '@/lib/messages/messages.contract';
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
      GET: implement(getSavedMessagesApi, { rateLimit: 'read' }, async ({ userId }) =>
        Response.json(
          { saved: await getSavedSummary(userId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      POST: implement(
        openSavedMessagesApi,
        { rateLimit: 'write', allowEmptyBody: true },
        async ({ userId }) => ({ conversationId: await ensureSavedConversation(userId) }),
      ),
    },
  },
});
