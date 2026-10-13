import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { createSeason, createSeasonSchema } from '@/lib/forecasting/forecasting.server';

/** POST /api/admin/forecasting/seasons — define a season over existing markets (G5). */
export const Route = createFileRoute('/api/admin/forecasting/seasons')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: createSeasonSchema },
        async ({ body }) => {
          const result = await createSeason(body);
          if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
          return Response.json({ id: result.id }, { status: 201 });
        },
      ),
    },
  },
});
