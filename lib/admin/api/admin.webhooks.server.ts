import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listAdminWebhooksApi } from '@/lib/admin/webhooks.contract';
import { webhooksQuery } from '@/lib/admin/webhooks-schema';
import { listWebhooks } from '@/lib/admin/webhooks.server';

/**
 * GET /api/admin/webhooks — webhook endpoints, newest first, 50 a page, filtered by `filter` (failing,
 * auto_disabled, admin_disabled, all), `owner` handle and destination `host`, with their 24-hour delivery figures.
 * Admin only; never a secret, a payload, a signature or a URL beyond its host and first path segment.
 */
export const route = apiRoute('/api/admin/webhooks', {
  GET: implement(
    listAdminWebhooksApi,
    { auth: 'admin', rateLimit: 'read', query: webhooksQuery },
    async ({ query }) => {
      const page = await listWebhooks(query);
      if (!page) return Response.json({ error: 'Invalid cursor' }, { status: 400 });
      return page;
    },
  ),
});
