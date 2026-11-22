import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { reorderCardsApi } from '@/lib/study/decks.contract';
import { reorderCardsBody } from '@/lib/study/decks-schema';
import { reorderCards } from '@/lib/study/deck-editor.server';

/** PUT /api/study/decks/$id/order — the deck's cards in a new order (owner). */
export const route = apiRoute('/api/study/decks/$id/order', {
  PUT: implement(reorderCardsApi, { rateLimit: 'write', body: reorderCardsBody }, async ({ userId, params, body }) => {
    const result = await reorderCards(userId, params.id, body.cardIds);
    if (!result.ok) return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });
    return { success: true as const };
  }),
});
