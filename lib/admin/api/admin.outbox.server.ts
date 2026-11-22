import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getAdminOutboxApi } from '@/lib/admin/outbox.contract';
import { summarizeOutbox } from '@/lib/admin/outbox-admin.server';

/** GET /api/admin/outbox — every outbox topic with its pending, scheduled, dead and delivered counts. Admin only. */
export const route = apiRoute('/api/admin/outbox', {
  GET: implement(
    getAdminOutboxApi,
    {
      auth: 'admin',
      rateLimit: 'read',
    },
    async () => {
      const now = new Date();
      return {
        topics: await summarizeOutbox(now),
        now: now.toISOString(),
      };
    },
  ),
});
