import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { cardHistoryApi } from '@/lib/study/card-history.contract';
import { cardHistory } from '@/lib/study/card-history.server';

/** GET /api/study/cards/$id/history — the member's own reviews of one card (newest 100), its state and next due date. */
export const route = apiRoute('/api/study/cards/$id/history', {
  GET: implement(cardHistoryApi, { rateLimit: 'read' }, async ({ userId, params }) => {
    const history = await cardHistory(userId, params.id);
    if (!history) return Response.json(refusalBody('NOT_FOUND'), { status: 404 });
    return history;
  }),
});
