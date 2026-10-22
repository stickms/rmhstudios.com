import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { officeHoursConfigSchema } from '@/lib/calendar/schema';
import { getMyConfig, listMyBookings, saveConfig } from '@/lib/calendar/office-hours.server';

/**
 * GET /api/office-hours — the caller's own settings and upcoming bookings (K2).
 * PUT /api/office-hours — publish or update their weekly windows.
 */
export const Route = createFileRoute('/api/office-hours/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
        const [config, bookings] = await Promise.all([getMyConfig(userId), listMyBookings(userId)]);
        return Response.json(
          { config, ...bookings },
          { headers: { 'Cache-Control': 'private, no-store' } },
        );
      }),
      PUT: defineHandler(
        { rateLimit: 'write', body: officeHoursConfigSchema },
        async ({ userId, body }) => {
          const result = await saveConfig(userId, body);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ config: result.value });
        },
      ),
    },
  },
});
