import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteSavedReplyApi, updateSavedReplyApi } from '@/lib/messages/saved-replies.contract';
import { patchSavedReplyBody } from '@/lib/messages/saved-replies-schema';
import { removeSavedReply, updateSavedReply } from '@/lib/messages/saved-replies.server';

/**
 * PATCH  /api/saved-replies/$id - change the title or the body.
 * DELETE /api/saved-replies/$id - delete one.
 * Another member's row answers 404, the same as a missing one.
 */
export const route = apiRoute('/api/saved-replies/$id', {
  PATCH: implement(
    updateSavedReplyApi,
    { rateLimit: 'write', body: patchSavedReplyBody },
    async ({ userId, params, body }) => {
      const result = await updateSavedReply(userId, params.id, body);
      if (!result.ok)
        return Response.json(
          { error: result.error, ...(result.code ? { code: result.code } : {}) },
          { status: result.status },
        );
      return { reply: result.value };
    },
  ),
  DELETE: implement(deleteSavedReplyApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const result = await removeSavedReply(userId, params.id);
    if (!result.ok)
      return Response.json(
        { error: result.error, ...(result.code ? { code: result.code } : {}) },
        { status: result.status },
      );
    return { success: true as const };
  }),
});
