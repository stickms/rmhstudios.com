import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { reviewUpsertSchema } from '@/lib/games/reviews';
import { upsertReview, deleteReview, GameMetaError } from '@/lib/games/meta.server';

/**
 * PUT    /api/games/:id/review { stars, body? } — upsert the caller's review.
 * DELETE /api/games/:id/review — delete it.
 */
export const Route = createFileRoute('/api/games/$id/review')({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), { limit: 10, windowMs: 60_000, prefix: 'game-review' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });
          const body = await request.json().catch(() => null);
          const parsed = reviewUpsertSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          try {
            await upsertReview(session.user.id, params.id, parsed.data);
          } catch (e) {
            if (e instanceof GameMetaError) return Response.json({ error: e.message }, { status: 400 });
            throw e;
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Game review upsert error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          await deleteReview(session.user.id, params.id);
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Game review delete error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
