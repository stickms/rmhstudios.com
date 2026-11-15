import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { getLatestDigest } from '@/lib/discovery/today.server';

/** GET /api/discovery/today — the latest daily digest snapshot (A3). */
export const route = apiRoute('/api/discovery/today', {
  GET: defineHandler({ auth: 'none', rateLimit: 'read' }, async () =>
    Response.json(await getLatestDigest(), {
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=600' },
    }),
  ),
});
