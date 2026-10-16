import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { requireChat } from '@/lib/chat-plus/route-helpers.server';
import { loadThread, postThreadReply, threadReplySchema } from '@/lib/chat-plus/threads.server';

/**
 * GET  /api/chats/group/$id/thread/$messageId — a message and its side-thread
 *      replies (M7). Group chats only.
 * POST /api/chats/group/$id/thread/$messageId — reply in the thread.
 */
export const Route = createFileRoute('/api/chats/$kind/$id/thread/$messageId')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ params, userId }) => {
        const access = await requireChat(params, userId);
        if (access instanceof Response) return access;
        const page = await loadThread(access, params.messageId);
        if (!page) return Response.json({ error: 'Thread not found' }, { status: 404 });
        return Response.json(page, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
      POST: defineHandler(
        {
          rateLimit: { limit: 40, windowMs: 60_000, prefix: 'chat-thread-reply' },
          body: threadReplySchema,
        },
        async ({ params, userId, body }) => {
          const access = await requireChat(params, userId, { write: true });
          if (access instanceof Response) return access;
          const reply = await postThreadReply(access, params.messageId, body.content);
          if (!reply) return Response.json({ error: 'Thread not found' }, { status: 404 });
          return Response.json({ reply }, { status: 201 });
        },
      ),
    },
  },
});
