import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { requireChat } from '@/lib/chat-plus/route-helpers.server';
import { getChatMeta } from '@/lib/chat-plus/settings.server';

/**
 * GET /api/chats/$kind/$id/meta — everything the chat header needs in one
 * request: the disappearing timer, the theme, the viewer's receipt/typing
 * switches and the pinned messages (M3, M6, M8, M9).
 */
export const Route = createFileRoute('/api/chats/$kind/$id/meta')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ params, userId }) => {
        const access = await requireChat(params, userId);
        if (access instanceof Response) return access;
        return Response.json(await getChatMeta(access), {
          headers: { 'Cache-Control': 'private, no-store' },
        });
      }),
    },
  },
});
