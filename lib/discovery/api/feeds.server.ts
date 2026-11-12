import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { listFeedsApi } from '@/lib/discovery/discovery.contract';
import { customFeedSchema } from '@/lib/discovery/schema';
import { createFeed, listFeeds } from '@/lib/discovery/feeds.server';

/**
 * GET  /api/feeds — my feeds, ones I subscribe to, and popular public ones (A4).
 * POST /api/feeds — define a feed (tags + people + keywords).
 */
export const route = apiRoute('/api/feeds', {
  GET: implement(listFeedsApi, { rateLimit: 'read' }, async ({ userId }) =>
    Response.json(await listFeeds(userId), {
      headers: { 'Cache-Control': 'private, no-store' },
    }),
  ),
  POST: defineHandler({ rateLimit: 'write', body: customFeedSchema }, async ({ userId, body }) => {
    const res = await createFeed(userId, body);
    if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
    return Response.json({ feed: res.feed }, { status: 201 });
  }),
});
