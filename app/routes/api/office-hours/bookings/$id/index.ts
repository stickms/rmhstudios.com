import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { cancelBooking } from '@/lib/calendar/office-hours.server';

/** DELETE /api/office-hours/bookings/:id — the host or the guest cancels; the slot frees up. */
export const Route = createFileRoute('/api/office-hours/bookings/$id/')({
  server: {
    handlers: {
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const result = await cancelBooking(params.id, userId);
        if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
        return Response.json({ ok: true });
      }),
    },
  },
});
