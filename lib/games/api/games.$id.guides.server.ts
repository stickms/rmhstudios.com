import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { listGuides, isValidGame } from '@/lib/games/meta.server';

/** GET /api/games/:id/guides — published guides (+ the caller's own drafts). */
export const route = apiRoute('/api/games/$id/guides', {
  GET: defineHandler({ auth: 'optional' }, async ({ params, userId }) => {
    if (!isValidGame(params.id)) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json({ guides: await listGuides(params.id, userId) });
  }),
});
