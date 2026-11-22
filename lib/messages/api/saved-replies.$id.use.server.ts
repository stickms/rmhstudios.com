import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { recordSavedReplyUseApi } from '@/lib/messages/saved-replies.contract';
import { recordSavedReplyUse } from '@/lib/messages/saved-replies.server';

/** POST /api/saved-replies/$id/use - a reply was inserted into a composer. Another member's row is a 404. */
export const route = apiRoute('/api/saved-replies/$id/use', {
  POST: implement(recordSavedReplyUseApi, { rateLimit: 'write', allowEmptyBody: true }, async ({ userId, params }) => {
    const result = await recordSavedReplyUse(userId, params.id);
    if (!result.ok)
      return Response.json(
        { error: result.error, ...refusalCodeOf(result), ...refusalCodeOf(result) },
        { status: result.status },
      );
    return { success: true as const };
  }),
});
