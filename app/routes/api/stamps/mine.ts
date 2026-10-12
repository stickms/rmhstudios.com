import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listMyStamps } from '@/lib/profile/stamps.server';

/** GET /api/stamps/mine — the stamps the caller has made (P5). */
export const Route = createFileRoute('/api/stamps/mine')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(
          { stamps: await listMyStamps(userId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
    },
  },
});
