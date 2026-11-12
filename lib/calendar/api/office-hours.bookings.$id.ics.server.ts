import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { bookingIcs } from '@/lib/calendar/office-hours.server';

/** GET /api/office-hours/bookings/:id/ics — the booking as a calendar file, for the host or guest. */
export const route = apiRoute('/api/office-hours/bookings/$id/ics', {
  GET: defineHandler({ rateLimit: 'read' }, async ({ userId, params }) => {
    const ics = await bookingIcs(params.id, userId);
    if (!ics) return Response.json({ error: 'Not found' }, { status: 404 });
    return new Response(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="office-hours.ics"',
        'Cache-Control': 'private, no-store',
      },
    });
  }),
});
