import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { calendarFeedICS, type ICSEvent } from '@/lib/events-ics';
import { getFeedSessions } from '@/lib/pf2ecal/sessions.server';
import { SITE_URL } from '@/lib/seo';

/**
 * GET /api/pf2ecal/calendar.ics — the subscribe feed.
 *
 * `auth: 'none'` and `visibility: 'public'`, which together are what make this
 * a *subscription* rather than a download. Apple Calendar, Google Calendar and
 * Outlook all poll a webcal URL from their own servers with no cookies
 * attached; a feed behind a session check appears to work when you paste it
 * into a browser and then silently never syncs. The trade is that the URL is
 * the credential — anyone holding it can read the table's schedule — which is
 * the same bargain the page itself makes by being unlisted rather than
 * permissioned.
 *
 * Everything here is already public to anyone with the link, and the response
 * is byte-identical for every caller, so it is safe for a shared cache.
 */
export const Route = createFileRoute('/api/pf2ecal/calendar.ics')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          // Calendar clients poll on their own schedule (typically 15-60
          // minutes) and ignore anything shorter, so a 15-minute shared cache
          // costs nothing in freshness and absorbs a table's worth of clients
          // plus whatever else pulls the URL.
          cache: { visibility: 'public', maxAge: 900, sMaxAge: 900, staleWhileRevalidate: 3600 },
        },
        async () => {
          const sessions = await getFeedSessions();

          const events: ICSEvent[] = sessions.map((session) => ({
            id: `pf2e-${session.id}`,
            title: session.title,
            description: session.notes || null,
            startsAt: session.startsAt,
            endsAt: session.endsAt,
            location: session.location || null,
            url: `${SITE_URL}/pf2ecal`,
            canceledAt: session.canceledAt,
            // Minutes since 2020 — monotonic per row, and small enough to stay
            // inside the 32-bit integer every client assumes SEQUENCE is.
            sequence: Math.max(
              0,
              Math.floor((session.updatedAt.getTime() - Date.UTC(2020, 0, 1)) / 60_000),
            ),
          }));

          const ics = calendarFeedICS(events, {
            name: 'Pathfinder 2e',
            description: 'Session schedule for the table',
            refreshMinutes: 60,
          });

          return new Response(ics, {
            headers: {
              'Content-Type': 'text/calendar; charset=utf-8',
              // `inline` rather than `attachment`: a subscribing client fetches
              // this URL directly, and a download disposition makes some
              // browsers save the file instead of handing it to the calendar.
              'Content-Disposition': 'inline; filename="pathfinder-2e.ics"',
            },
          });
        },
      ),
    },
  },
});
