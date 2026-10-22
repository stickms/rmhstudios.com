import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { reportPackSchema } from '@/lib/party/packs-schema';
import { reportPack } from '@/lib/party/packs.server';

/** POST /api/rmhbox/packs/:id/report — flag a pack; repeat reporters are ignored. */
export const Route = createFileRoute('/api/rmhbox/packs/$id/report')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: reportPackSchema },
        async ({ userId, params, body }) => {
          const r = await reportPack(userId, params.id, body.reason);
          if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
