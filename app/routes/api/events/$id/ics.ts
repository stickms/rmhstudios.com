import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { SITE_URL } from '@/lib/seo';
import { eventToICS } from '@/lib/events-ics';
import { canViewEvent } from '@/lib/events.server';
import { auth } from '@/lib/auth';

/**
 * GET /api/events/$id/ics — download a single-event .ics file. Public: anyone
 * with the link can add a public event to their calendar (no auth required).
 * A private-community, PRIVATE (a poll's) or DRAFT event answers 404 unless the
 * viewer may see it (`canViewEvent`).
 */
export const Route = createFileRoute('/api/events/$id/ics')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const event = await prisma.event.findUnique({
          where: { id: params.id },
          select: {
            id: true,
            hostId: true,
            visibility: true,
            pollId: true,
            href: true,
            title: true,
            description: true,
            startsAt: true,
            endsAt: true,
            venueKind: true,
            venueRef: true,
            canceledAt: true,
            communityId: true,
            community: { select: { name: true, isPrivate: true } },
          },
        });
        if (!event) return Response.json({ error: 'Not found' }, { status: 404 });

        // Private-community and PRIVATE events are members-only (404 otherwise); such a
        // response must not be shared-cached.
        const isPrivate = !!event.community?.isPrivate || event.visibility !== 'PUBLIC';
        const viewerId = isPrivate
          ? ((await auth.api.getSession({ headers: request.headers }).catch(() => null))?.user.id ??
            null)
          : null;
        if (!(await canViewEvent(event, viewerId))) {
          return Response.json({ error: 'Not found' }, { status: 404 });
        }

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
          url:
            event.venueKind === 'URL' && event.venueRef
              ? event.venueRef
              : `${SITE_URL}${event.href ?? '/calendar'}`,
          canceledAt: event.canceledAt,
        });

        return new Response(ics, {
          headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'attachment; filename="event.ics"',
            'Cache-Control': isPrivate ? 'private, no-store' : 'public, max-age=300',
          },
        });
      },
    },
  },
});
