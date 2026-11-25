import { apiRoute } from '@/lib/api/route.server';
import { restrictionResponse } from '@/lib/moderation/restrictions.server';
import { implement } from '@/lib/api/implement.server';
import { createGuideApi } from '@/lib/games/guides.contract';
import { guideCreateSchema } from '@/lib/games/reviews';
import { createGuide, GameMetaError } from '@/lib/games/meta.server';

/** POST /api/guides { gameId, title, body } — create a draft guide. */
export const route = apiRoute('/api/guides', {
  POST: implement(
    createGuideApi,
    {
      rateLimit: { limit: 10, windowMs: 3_600_000, prefix: 'guides' },
      body: guideCreateSchema,
    },
    async ({ session, body }) => {
      const restricted = await restrictionResponse(session.user.id, 'comment');
      if (restricted) return restricted;
      try {
        const id = await createGuide(session.user.id, body);
        return Response.json({ id });
      } catch (e) {
        if (e instanceof GameMetaError) return Response.json({ error: e.message }, { status: 400 });
        throw e;
      }
    },
  ),
});
