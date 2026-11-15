import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getChatMetaApi } from '@/lib/chat-plus/chat.contract';
import { requireChat } from '@/lib/chat-plus/route-helpers.server';
import { getChatMeta } from '@/lib/chat-plus/settings.server';

/**
 * GET /api/chats/$kind/$id/meta — everything the chat header needs in one
 * request: the disappearing timer, the theme, the viewer's receipt/typing
 * switches and the pinned messages (M3, M6, M8, M9).
 */
export const route = apiRoute('/api/chats/$kind/$id/meta', {
  GET: implement(getChatMetaApi, { rateLimit: 'read' }, async ({ params, userId }) => {
    const access = await requireChat(params, userId);
    if (access instanceof Response) return access;
    return Response.json(await getChatMeta(access), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }),
});
