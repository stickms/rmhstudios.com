import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { reviewVoteSchema } from '@/lib/games/reviews';
import { voteReview, unvoteReview, GameMetaError } from '@/lib/games/meta.server';

/**
 * POST   /api/reviews/:id/vote { helpful } — mark a review helpful/unhelpful.
 * DELETE /api/reviews/:id/vote — clear your vote.
 */
export const Route = createFileRoute('/api/reviews/$id/vote')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), { limit: 30, windowMs: 60_000, prefix: 'review-vote' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });
          const body = await request.json().catch(() => null);
          const parsed = reviewVoteSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          try {
            await voteReview(session.user.id, params.id, parsed.data.helpful);
          } catch (e) {
            if (e instanceof GameMetaError) {
              return Response.json({ error: e.message }, { status: e.message === 'NOT_FOUND' ? 404 : 400 });
            }
            throw e;
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Review vote error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          await unvoteReview(session.user.id, params.id);
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Review unvote error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
