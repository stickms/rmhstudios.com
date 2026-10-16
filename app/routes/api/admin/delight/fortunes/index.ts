import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { pendingFortunes } from '@/lib/delight/fortune.server';

/** GET /api/admin/delight/fortunes — the moderation queue, oldest first. */
export const Route = createFileRoute('/api/admin/delight/fortunes/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () =>
        Response.json({ pending: await pendingFortunes() }),
      ),
    },
  },
});
