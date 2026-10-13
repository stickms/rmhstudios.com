import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { bookOfficeHoursSchema } from '@/lib/calendar/schema';
import { bookSlot, getPublicView } from '@/lib/calendar/office-hours.server';

/**
 * GET  /api/office-hours/host/:id — a host's open slots (and, for the host, their bookings).
 * POST /api/office-hours/host/:id — book one slot. One booking per slot, enforced by a unique constraint.
 */
export const Route = createFileRoute('/api/office-hours/host/$id/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId, params }) => {
        const view = await getPublicView(params.id, userId);
        if (!view) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ view }, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
      POST: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'office-hours-book' },
          body: bookOfficeHoursSchema,
        },
        async ({ userId, params, body }) => {
          const result = await bookSlot(params.id, userId, body.startsAt, body.note);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ booking: result.value }, { status: 201 });
        },
      ),
    },
  },
});
