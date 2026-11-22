import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteCardApi, updateCardApi } from '@/lib/study/decks.contract';
import { updateCardBody } from '@/lib/study/decks-schema';
import { deleteCard, updateCard } from '@/lib/study/deck-editor.server';

/**
 * PATCH  /api/study/cards/$id — edit a card's text (owner; its reviews stay).
 * DELETE /api/study/cards/$id — delete a card and its reviews (owner).
 */
export const route = apiRoute('/api/study/cards/$id', {
  PATCH: implement(updateCardApi, { rateLimit: 'write', body: updateCardBody }, async ({ userId, params, body }) => {
    const result = await updateCard(userId, params.id, body);
    if (!result.ok) return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });
    return { success: true as const };
  }),

  DELETE: implement(deleteCardApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const result = await deleteCard(userId, params.id);
    if (!result.ok) return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });
    return { success: true as const };
  }),
});
