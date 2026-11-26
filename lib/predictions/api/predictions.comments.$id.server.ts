import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deletePredictionCommentApi } from '@/lib/predictions/predictions.contract';
import { deleteComment } from '@/lib/forecasting/forecasting.server';
import { refusalBody } from '@/lib/errors/codes';

/**
 * DELETE /api/predictions/comments/$id — delete a market comment. Its author or an admin may; the row is removed, so
 * it is gone for everyone. Anyone else, and an id that does not exist, get the same 404.
 */
export const route = apiRoute('/api/predictions/comments/$id', {
  DELETE: implement(deletePredictionCommentApi, { rateLimit: 'write' }, async ({ params, userId, isAdmin }) => {
    const result = await deleteComment(params.id, userId, isAdmin);
    if (result === 'not_found') return Response.json(refusalBody('NOT_FOUND'), { status: 404 });
    return { deleted: true as const };
  }),
});
