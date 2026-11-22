import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createSavedReplyApi, listSavedRepliesApi } from '@/lib/messages/saved-replies.contract';
import { createSavedReplyBody } from '@/lib/messages/saved-replies-schema';
import { createSavedReply, listSavedReplies } from '@/lib/messages/saved-replies.server';

/**
 * GET  /api/saved-replies - the caller's saved replies.
 * POST /api/saved-replies - add one (at most 50; the 51st is a 409 with code `limit`). Session only; only the caller's rows.
 */
export const route = apiRoute('/api/saved-replies', {
  GET: implement(listSavedRepliesApi, { rateLimit: 'read' }, async ({ userId }) => ({
    replies: await listSavedReplies(userId),
  })),
  POST: implement(createSavedReplyApi, { rateLimit: 'write', body: createSavedReplyBody }, async ({ userId, body }) => {
    const result = await createSavedReply(userId, body);
    if (!result.ok)
      return Response.json(
        { error: result.error, ...refusalCodeOf(result), ...refusalCodeOf(result) },
        { status: result.status },
      );
    return Response.json({ reply: result.value }, { status: 201 });
  }),
});
