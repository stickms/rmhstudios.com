import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { customFeedSchema } from '@/lib/discovery/schema';
import { createFeed, listFeeds } from '@/lib/discovery/feeds.server';

/**
 * GET  /api/feeds — my feeds, ones I subscribe to, and popular public ones (A4).
 * POST /api/feeds — define a feed (tags + people + keywords).
 */
export const Route = createFileRoute('/api/feeds/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(await listFeeds(userId), {
          headers: { 'Cache-Control': 'private, no-store' },
        }),
      ),
      POST: defineHandler(
        { rateLimit: 'write', body: customFeedSchema },
        async ({ userId, body }) => {
          const res = await createFeed(userId, body);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ feed: res.feed }, { status: 201 });
        },
      ),
    },
  },
});
