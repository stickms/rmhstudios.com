import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { getChallenge } from '@/lib/studio/challenge/challenge.server';

/** GET /api/studio/challenges/:id — the sample, entries and the viewer's own entry/vote (F12). */
export const route = apiRoute('/api/studio/challenges/$id', {
  GET: defineHandler({ rateLimit: 'read' }, async ({ userId, params }) => {
    const c = await getChallenge(params.id, userId);
    if (!c) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json(c, { headers: { 'Cache-Control': 'private, no-store' } });
  }),
});
