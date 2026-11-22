import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { reorderSavedRepliesApi } from '@/lib/messages/saved-replies.contract';
import { reorderSavedRepliesBody } from '@/lib/messages/saved-replies-schema';
import { parseIdList } from '@/lib/messages/saved-replies';
import { reorderSavedReplies } from '@/lib/messages/saved-replies.server';

/**
 * PUT /api/saved-replies/order - `{ ids }`, one comma-separated list: those replies first, in that order, the rest
 * after them. One transaction; an id that is not the caller's is a 404 and nothing is written.
 */
export const route = apiRoute('/api/saved-replies/order', {
  PUT: implement(
    reorderSavedRepliesApi,
    { rateLimit: 'write', body: reorderSavedRepliesBody },
    async ({ userId, body }) => {
      const result = await reorderSavedReplies(userId, parseIdList(body.ids) ?? []);
      if (!result.ok)
        return Response.json(
          { error: result.error, ...(result.code ? { code: result.code } : {}) },
          { status: result.status },
        );
      return { replies: result.value };
    },
  ),
});
