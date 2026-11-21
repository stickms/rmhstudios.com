import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listMutedConversationsApi } from '@/lib/feed/conversation-controls.contract';
import { mutedConversationsQuery } from '@/lib/feed/conversation-controls-schema';
import { listMutedConversations } from '@/lib/feed/conversation-controls.server';

/**
 * GET /api/settings/muted-conversations — the caller's muted post conversations (timed, open-ended, or Mentions only),
 * newest change first, 50 a page. `?cursor=` continues the list.
 */
export const route = apiRoute('/api/settings/muted-conversations', {
  GET: implement(
    listMutedConversationsApi,
    {
      rateLimit: 'read',
      query: mutedConversationsQuery,
    },
    async ({ userId, query }) =>
      Response.json(await listMutedConversations(userId, query.cursor ?? null), {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }),
  ),
});
