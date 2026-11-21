import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { testWebhookApi } from '@/lib/developer/webhooks.contract';
import { sendTestEvent } from '@/lib/developer/webhooks.server';

/**
 * POST /api/developer/webhooks/$id/test — deliver a `ping` to this endpoint only,
 * whatever events it subscribes to, and answer with the recorded delivery.
 * Shares the manual-send bucket (10 a minute per user) with redelivery.
 */
export const route = apiRoute('/api/developer/webhooks/$id/test', {
  POST: implement(
    testWebhookApi,
    {
      rateLimit: { policy: 'write', scope: 'user', prefix: 'webhook-manual', limit: 10, windowMs: 60_000 },
    },
    async ({ userId, params }) => {
      const sent = await sendTestEvent(userId, params.id);
      if (!sent.ok) return Response.json({ error: sent.error }, { status: sent.status });
      return { delivery: sent.delivery };
    },
  ),
});
