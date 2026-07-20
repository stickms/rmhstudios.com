import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { SITE_URL } from '@/lib/seo';
import { eventToICS } from '@/lib/events-ics';

/**
 * GET /api/events/$id/ics — download a single-event .ics file. Public: anyone
 * with the link can add a public event to their calendar (no auth required).
 */
export const Route = createFileRoute('/api/events/$id/ics')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const event = await prisma.communityEvent.findUnique({
          where: { id: params.id },
          select: {
            id: true,
            title: true,
            description: true,
            startsAt: true,
            endsAt: true,
            venueKind: true,
            venueRef: true,
            canceledAt: true,
            community: { select: { name: true } },
          },
        });
        if (!event) return Response.json({ error: 'Not found' }, { status: 404 });

        const location =
          event.venueKind === 'URL'
            ? event.venueRef
            : event.venueRef
              ? `${event.venueKind}: ${event.venueRef}`
              : (event.community?.name ?? null);

        const ics = eventToICS({
          id: event.id,
          title: event.title,
          description: event.description,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          location,
          url: event.venueKind === 'URL' && event.venueRef ? event.venueRef : `${SITE_URL}/events`,
          canceledAt: event.canceledAt,
        });

        return new Response(ics, {
          headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'attachment; filename="event.ics"',
            'Cache-Control': 'public, max-age=300',
          },
        });
      },
    },
  },
});
