import { apiRoute } from '@/lib/api/route.server';
import { restrictionResponse } from '@/lib/moderation/restrictions.server';
import { defineHandler } from '@/lib/api/handler.server';
import { reviewUpsertSchema } from '@/lib/games/reviews';
import { upsertReview, deleteReview, GameMetaError } from '@/lib/games/meta.server';
import { GAME_CONTENT_REMOVED } from '@/lib/games/moderation';
import { refusalBody } from '@/lib/errors/codes';

/**
 * PUT    /api/games/:id/review { stars, body? } — upsert the caller's review.
 * DELETE /api/games/:id/review — delete it.
 */
export const route = apiRoute('/api/games/$id/review', {
  PUT: defineHandler(
    {
      rateLimit: { limit: 10, windowMs: 60_000, prefix: 'game-review' },
      body: reviewUpsertSchema,
    },
    async ({ params, session, body }) => {
      const restricted = await restrictionResponse(session.user.id, 'comment');
      if (restricted) return restricted;
      try {
        await upsertReview(session.user.id, params.id, body);
      } catch (e) {
        if (e instanceof GameMetaError) {
          // A review a moderator removed cannot be edited by its author (s14-08).
          if (e.message === GAME_CONTENT_REMOVED) {
            return Response.json(refusalBody('GAME_CONTENT_REMOVED_BY_MODERATOR'), { status: 409 });
          }
          return Response.json({ error: e.message }, { status: 400 });
        }
        throw e;
      }
      return Response.json({ ok: true });
    },
  ),
  DELETE: defineHandler({}, async ({ params, session }) => {
    try {
      await deleteReview(session.user.id, params.id);
    } catch (e) {
      if (e instanceof GameMetaError && e.message === GAME_CONTENT_REMOVED) {
        return Response.json(refusalBody('GAME_CONTENT_REMOVED_BY_MODERATOR'), { status: 409 });
      }
      throw e;
    }
    return Response.json({ ok: true });
  }),
});
