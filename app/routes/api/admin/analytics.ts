import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
import { getAdminAnalytics } from '@/lib/admin/analytics.server';

/** GET /api/admin/analytics — platform stats for the admin dashboard. */
export const Route = createFileRoute('/api/admin/analytics')({
  server: {
    handlers: {
      GET: implement(C.getAdminAnalyticsApi, { auth: 'admin' }, async () =>
        Response.json(await getAdminAnalytics()),
      ),
    },
  },
});
