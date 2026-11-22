import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { testWebhookApi } from '@/lib/developer/webhooks.contract';
import { testEventQuery } from '@/lib/developer/webhooks-schema';
import { WEBHOOK_PING_EVENT } from '@/lib/webhooks/events';
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
      query: testEventQuery,
    },
    async ({ userId, params, query }) => {
      const sent = await sendTestEvent(userId, params.id, query.event ?? WEBHOOK_PING_EVENT);
      if (!sent.ok) return Response.json({ error: sent.error }, { status: sent.status });
      return { delivery: sent.delivery };
    },
  ),
});
