import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { publishGuideApi } from '@/lib/games/guides.contract';
import { guidePublishBody } from '@/lib/games/reviews';
import { publishGuide, GameMetaError } from '@/lib/games/meta.server';

/** POST /api/guides/:id/publish { published } — publish/unpublish (author). */
export const route = apiRoute('/api/guides/$id/publish', {
  POST: implement(
    publishGuideApi,
    {
      rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:guides/:id.publish' },
      body: guidePublishBody,
    },
    async ({ params, session, body }) => {
      try {
        await publishGuide(session.user.id, params.id, body.published);
      } catch (e) {
        if (e instanceof GameMetaError) return Response.json({ error: e.message }, { status: 404 });
        throw e;
      }
      return Response.json({ ok: true });
    },
  ),
});
