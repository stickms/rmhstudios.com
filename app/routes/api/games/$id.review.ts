import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { reviewUpsertSchema } from '@/lib/games/reviews';
import { upsertReview, deleteReview, GameMetaError } from '@/lib/games/meta.server';

/**
 * PUT    /api/games/:id/review { stars, body? } — upsert the caller's review.
 * DELETE /api/games/:id/review — delete it.
 */
export const Route = createFileRoute('/api/games/$id/review')({
  server: {
    handlers: {
      PUT: defineHandler(
        {
          rateLimit: { limit: 10, windowMs: 60_000, prefix: 'game-review' },
          body: reviewUpsertSchema,
        },
        async ({ params, session, body }) => {
          try {
            await upsertReview(session.user.id, params.id, body);
          } catch (e) {
            if (e instanceof GameMetaError)
              return Response.json({ error: e.message }, { status: 400 });
            throw e;
          }
          return Response.json({ ok: true });
        },
      ),
      DELETE: defineHandler({}, async ({ params, session }) => {
        await deleteReview(session.user.id, params.id);
        return Response.json({ ok: true });
      }),
    },
  },
});
