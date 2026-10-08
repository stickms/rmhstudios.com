import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { calendarFeedICS } from '@/lib/events-ics';
import { calendarEvents } from '@/lib/dunesday/feed';
import { FEED_ID } from '@/lib/dunesday/sync-schema';
import { feedContext, loadFeed } from '@/lib/dunesday/sync.server';

/**
 * GET /api/dunesday/feeds/:feedId/calendar.ics — the live calendar subscription.
 *
 * `auth: 'none'`: Apple, Google and Outlook poll this from their own servers
 * with no cookies, so the unguessable feed id IS the credential (it can read a
 * watch list, never change one). Re-planned on every fetch, so a missed night
 * or a ticked-off film reshuffles the calendar on the next poll.
 */
export const Route = createFileRoute('/api/dunesday/feeds/$feedId/calendar.ics')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          cache: { visibility: 'public', maxAge: 600, sMaxAge: 600, staleWhileRevalidate: 3600 },
        },
        async ({ params }) => {
          if (!FEED_ID.test(params.feedId)) return new Response('Not found', { status: 404 });
          const row = await loadFeed(params.feedId);
          if (!row) return new Response('Not found', { status: 404 });
          const ics = calendarFeedICS(calendarEvents(feedContext(row), row.updatedAt), {
            name: 'Dunesday Marathon',
            description: 'Every MCU film and series + Dune, night by night, until Dunesday.',
            refreshMinutes: 60,
          });
          return new Response(ics, {
            headers: {
              'Content-Type': 'text/calendar; charset=utf-8',
              'Content-Disposition': 'inline; filename="dunesday.ics"',
            },
          });
        },
      ),
    },
  },
});
