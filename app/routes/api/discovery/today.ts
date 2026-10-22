import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getLatestDigest } from '@/lib/discovery/today.server';

/** GET /api/discovery/today — the latest daily digest snapshot (A3). */
export const Route = createFileRoute('/api/discovery/today')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none', rateLimit: 'read' }, async () =>
        Response.json(await getLatestDigest(), {
          headers: { 'Cache-Control': 'public, max-age=300, s-maxage=600' },
        }),
      ),
    },
  },
});
