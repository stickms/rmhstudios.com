import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { listReviews, getRatingAgg, isValidGame } from '@/lib/games/meta.server';

/** GET /api/games/:id/reviews?sort=helpful|recent — reviews + rating aggregate. */
export const Route = createFileRoute('/api/games/$id/reviews')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          if (!isValidGame(params.id)) return Response.json({ error: 'Not found' }, { status: 404 });
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const sort = new URL(request.url).searchParams.get('sort') === 'recent' ? 'recent' : 'helpful';
          const [reviews, agg] = await Promise.all([
            listReviews(params.id, session?.user.id ?? null, sort),
            getRatingAgg(params.id),
          ]);
          return Response.json({ reviews, agg });
        } catch (error) {
          console.error('Game reviews error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
