import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { reviewVoteSchema } from '@/lib/games/reviews';
import { voteReview, unvoteReview, GameMetaError } from '@/lib/games/meta.server';

/**
 * POST   /api/reviews/:id/vote { helpful } — mark a review helpful/unhelpful.
 * DELETE /api/reviews/:id/vote — clear your vote.
 */
export const Route = createFileRoute('/api/reviews/$id/vote')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'review-vote' } },
        async ({ request, params, session }) => {
          const body = await request.json().catch(() => null);
          const parsed = reviewVoteSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          try {
            await voteReview(session.user.id, params.id, parsed.data.helpful);
          } catch (e) {
            if (e instanceof GameMetaError) {
              return Response.json(
                { error: e.message },
                { status: e.message === 'NOT_FOUND' ? 404 : 400 },
              );
            }
            throw e;
          }
          return Response.json({ ok: true });
        },
      ),
      DELETE: defineHandler({}, async ({ params, session }) => {
        await unvoteReview(session.user.id, params.id);
        return Response.json({ ok: true });
      }),
    },
  },
});
