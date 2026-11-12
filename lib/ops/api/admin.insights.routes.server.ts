import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { getRouteViews } from '@/lib/ops/route-views.server';

/** GET /api/admin/insights/routes — hard-load views per route over 90 days (dead-feature detector). */
export const route = apiRoute('/api/admin/insights/routes', {
  GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () =>
    Response.json(await getRouteViews()),
  ),
});
