import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getRouteViews } from '@/lib/ops/route-views.server';

/** GET /api/admin/insights/routes — hard-load views per route over 90 days (dead-feature detector). */
export const Route = createFileRoute('/api/admin/insights/routes')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () =>
        Response.json(await getRouteViews()),
      ),
    },
  },
});
