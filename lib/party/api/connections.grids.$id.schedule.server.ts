import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { scheduleConnectionGridApi } from '@/lib/party/connections.contract';
import { scheduleSchema } from '@/lib/party/connections-schema';
import { scheduleGrid } from '@/lib/party/connections.server';

/** POST /api/connections/grids/:id/schedule — admin: make this grid the daily for a UTC date. */
export const route = apiRoute('/api/connections/grids/$id/schedule', {
  POST: implement(
    scheduleConnectionGridApi,
    { auth: 'admin', rateLimit: 'write', body: scheduleSchema },
    async ({ params, body }) => {
      const r = await scheduleGrid(params.id, body.date);
      if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
      return Response.json({ ok: true });
    },
  ),
});
