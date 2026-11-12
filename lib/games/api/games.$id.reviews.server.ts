import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { listReviews, getRatingAgg, isValidGame } from '@/lib/games/meta.server';

/** GET /api/games/:id/reviews?sort=helpful|recent — reviews + rating aggregate. */
export const route = apiRoute('/api/games/$id/reviews', {
  GET: defineHandler({ auth: 'optional' }, async ({ request, params, userId }) => {
    if (!isValidGame(params.id)) return Response.json({ error: 'Not found' }, { status: 404 });
    const sort = new URL(request.url).searchParams.get('sort') === 'recent' ? 'recent' : 'helpful';
    const [reviews, agg] = await Promise.all([
      listReviews(params.id, userId, sort),
      getRatingAgg(params.id),
    ]);
    return Response.json({ reviews, agg });
  }),
});
