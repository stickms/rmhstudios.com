import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { reportPackSchema } from '@/lib/party/packs-schema';
import { reportPack } from '@/lib/party/packs.server';

/**
 * POST /api/rmhbox/packs/:id/report — kept for old clients. It files the same `ContentReport` (type `rmhbox-pack`,
 * reason `OTHER`, the body's reason as its details) the pack page's report dialog files, so there is one queue.
 * Repeat reporters are ignored.
 */
export const route = apiRoute('/api/rmhbox/packs/$id/report', {
  POST: defineHandler(
    { rateLimit: 'write', body: reportPackSchema },
    async ({ userId, params, body }) => {
      const r = await reportPack(userId, params.id, body.reason);
      if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
      return Response.json({ ok: true });
    },
  ),
});
