import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { scheduleSchema } from '@/lib/party/connections-schema';
import { scheduleGrid } from '@/lib/party/connections.server';

/** POST /api/connections/grids/:id/schedule — admin: make this grid the daily for a UTC date. */
export const Route = createFileRoute('/api/connections/grids/$id/schedule')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: scheduleSchema },
        async ({ params, body }) => {
          const r = await scheduleGrid(params.id, body.date);
          if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
