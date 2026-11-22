import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { eventToICS } from '@/lib/events-ics';
import { partyToIcsEvent } from '@/lib/rmhtube/parties';
import { partyForCalendar, refusalResponse, roomIdFromParams } from '@/lib/rmhtube/parties.server';
import { SITE_URL } from '@/lib/seo';

/**
 * GET /api/rmhtube/parties/$roomId/ics — the calendar file for one watch party. A route file because the
 * answer is a download, not JSON. The room code is the capability for a link-only party (anyone holding the
 * link may add it to a calendar), so no session is needed; a link-only answer is never shared-cached.
 */
export const Route = createFileRoute('/api/rmhtube/parties/$roomId/ics')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
        },
        async ({ params }) => {
          const roomId = roomIdFromParams(params);
          const party = roomId ? await partyForCalendar(roomId) : null;
          if (!party) return refusalResponse('NOT_FOUND');
          const ics = eventToICS(partyToIcsEvent(party, SITE_URL, 'RMHTube watch party'));
          return new Response(ics, {
            headers: {
              'Content-Type': 'text/calendar; charset=utf-8',
              'Content-Disposition': `attachment; filename="rmhtube-party-${party.roomId}.ics"`,
              'Cache-Control': party.isPublic ? 'public, max-age=300' : 'private, no-store',
            },
          });
        },
      ),
    },
  },
});
