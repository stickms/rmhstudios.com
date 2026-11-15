import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { pendingFortunes } from '@/lib/delight/fortune.server';

/** GET /api/admin/delight/fortunes — the moderation queue, oldest first. */
export const route = apiRoute('/api/admin/delight/fortunes', {
  GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () =>
    Response.json({ pending: await pendingFortunes() }),
  ),
});
