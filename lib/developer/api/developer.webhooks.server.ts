import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createWebhookApi, listWebhooksApi } from '@/lib/developer/webhooks.contract';
import { createWebhookBody } from '@/lib/developer/webhooks-schema';
import { createWebhook, listWebhooks } from '@/lib/developer/webhooks.server';

/**
 * GET  /api/developer/webhooks — the viewer's webhook endpoints, with health.
 * POST /api/developer/webhooks — register one. The signing secret is returned
 *      exactly once, in this response.
 *
 * The console's session-authenticated twin of `/api/v1/webhooks` (API key).
 */
export const route = apiRoute('/api/developer/webhooks', {
  GET: implement(listWebhooksApi, { rateLimit: 'read' }, ({ userId }) => listWebhooks(userId)),

  POST: implement(
    createWebhookApi,
    { rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:developer/webhooks' }, body: createWebhookBody },
    async ({ userId, body }) => {
      const created = await createWebhook(userId, body);
      if (!created.ok) return Response.json({ error: created.error }, { status: created.status });
      return Response.json({ endpoint: created.endpoint, secret: created.secret }, { status: 201 });
    },
  ),
});
