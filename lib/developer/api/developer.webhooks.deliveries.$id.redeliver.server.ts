import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { redeliverWebhookApi } from '@/lib/developer/webhooks.contract';
import { redeliver } from '@/lib/developer/webhooks.server';

/**
 * POST /api/developer/webhooks/deliveries/$id/redeliver — send a delivered or
 * failed delivery again as a new row that points at the original, which is
 * never modified. Shares the manual-send bucket with the test event.
 */
export const route = apiRoute('/api/developer/webhooks/deliveries/$id/redeliver', {
  POST: implement(
    redeliverWebhookApi,
    {
      rateLimit: { policy: 'write', scope: 'user', prefix: 'webhook-manual', limit: 10, windowMs: 60_000 },
    },
    async ({ userId, params }) => {
      const sent = await redeliver(userId, params.id);
      if (!sent.ok) return Response.json({ error: sent.error }, { status: sent.status });
      return { delivery: sent.delivery };
    },
  ),
});
