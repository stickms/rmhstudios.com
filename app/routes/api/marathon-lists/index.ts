import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { marathonListSchema } from '@/lib/tools/schemas';
import { createMarathon, listMarathons } from '@/lib/tools/tools.server';

/** GET/POST /api/marathon-lists — the caller's own lists (P21 tools). */
export const Route = createFileRoute('/api/marathon-lists/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(
          { lists: await listMarathons(userId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      POST: defineHandler(
        { rateLimit: 'write', body: marathonListSchema },
        async ({ userId, body }) => {
          const r = await createMarathon(userId, body);
          if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
          return Response.json({ id: r.id }, { status: 201 });
        },
      ),
    },
  },
});
