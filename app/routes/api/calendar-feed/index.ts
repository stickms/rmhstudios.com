import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { calendarFeedPatchSchema } from '@/lib/calendar/schema';
import { getFeedView, updateFeed } from '@/lib/calendar/feed.server';

/**
 * GET   /api/calendar-feed — the caller's feed settings (subscribe URL, opt-in slots).
 * PATCH /api/calendar-feed — enable/disable, rotate the token, choose opted-in game nights.
 */
export const Route = createFileRoute('/api/calendar-feed/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(
          { feed: await getFeedView(userId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      PATCH: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'calendar-feed' },
          body: calendarFeedPatchSchema,
        },
        async ({ userId, body }) => Response.json({ feed: await updateFeed(userId, body) }),
      ),
    },
  },
});
