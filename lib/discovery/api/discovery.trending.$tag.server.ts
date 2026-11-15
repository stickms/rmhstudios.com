import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { whyTrending } from '@/lib/discovery/trending.server';

/** GET /api/discovery/trending/$tag — why a tag is trending (A2). */
export const route = apiRoute('/api/discovery/trending/$tag', {
  GET: defineHandler({ auth: 'none', rateLimit: 'read' }, async ({ params }) => {
    const why = await whyTrending(params.tag);
    if (!why) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json(why, { headers: { 'Cache-Control': 'public, max-age=300' } });
  }),
});
