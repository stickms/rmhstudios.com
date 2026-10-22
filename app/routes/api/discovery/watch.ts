import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { watchQuery, watchSchema } from '@/lib/discovery/schema';
import { getWatchLevel, setWatchLevel } from '@/lib/discovery/watch.server';

/** GET ?kind&targetId / PUT { kind, targetId, level } /api/discovery/watch — watch levels (A7). */
export const Route = createFileRoute('/api/discovery/watch')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read', query: watchQuery }, async ({ userId, query }) =>
        Response.json(
          { level: await getWatchLevel(userId, query.kind, query.targetId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      PUT: defineHandler({ rateLimit: 'write', body: watchSchema }, async ({ userId, body }) => {
        const res = await setWatchLevel(userId, body.kind, body.targetId, body.level);
        if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
        return Response.json({ level: body.level });
      }),
    },
  },
});
