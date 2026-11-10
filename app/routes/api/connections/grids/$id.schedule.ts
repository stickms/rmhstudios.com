import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { scheduleConnectionGridApi } from '@/lib/party/connections.contract';
import { scheduleSchema } from '@/lib/party/connections-schema';
import { scheduleGrid } from '@/lib/party/connections.server';

/** POST /api/connections/grids/:id/schedule — admin: make this grid the daily for a UTC date. */
export const Route = createFileRoute('/api/connections/grids/$id/schedule')({
  server: {
    handlers: {
      POST: implement(scheduleConnectionGridApi, 
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
