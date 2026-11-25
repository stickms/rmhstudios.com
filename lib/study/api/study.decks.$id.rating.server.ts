import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getDeckRatingApi, rateDeckApi, removeDeckRatingApi } from '@/lib/study/deck-ratings.contract';
import { rateDeckBody } from '@/lib/study/deck-ratings-schema';
import { myRating, rateDeck, removeRating } from '@/lib/study/deck-ratings.server';

/**
 * GET    /api/study/decks/$id/rating — the deck's aggregate and the caller's own stars and eligibility.
 * PUT    /api/study/decks/$id/rating — rate a public deck 1 to 5 (a studied copy, not the owner or an editor).
 * DELETE /api/study/decks/$id/rating — take the caller's rating back.
 */
export const route = apiRoute('/api/study/decks/$id/rating', {
  GET: implement(getDeckRatingApi, { rateLimit: 'read' }, async ({ userId, params }) => {
    const view = await myRating(userId, params.id);
    if (!view) return Response.json({ error: 'Not found' }, { status: 404 });
    return view;
  }),

  PUT: implement(rateDeckApi, { rateLimit: 'write', body: rateDeckBody }, async ({ userId, params, body }) => {
    const result = await rateDeck(userId, params.id, body.stars);
    if (!result.ok) return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });
    return { success: true as const, stars: result.stars, summary: result.summary };
  }),

  DELETE: implement(removeDeckRatingApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const result = await removeRating(userId, params.id);
    if (!result.ok) return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });
    return { success: true as const, stars: result.stars, summary: result.summary };
  }),
});
