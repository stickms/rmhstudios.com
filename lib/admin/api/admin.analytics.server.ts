import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
import { getAdminAnalytics } from '@/lib/admin/analytics.server';

/** GET /api/admin/analytics — platform stats for the admin dashboard. */
export const route = apiRoute('/api/admin/analytics', {
  GET: implement(C.getAdminAnalyticsApi, { auth: 'admin' }, async () =>
    Response.json(await getAdminAnalytics()),
  ),
});
