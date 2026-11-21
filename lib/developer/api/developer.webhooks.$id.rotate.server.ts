import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { rotateWebhookSecretApi } from '@/lib/developer/webhooks.contract';
import { rotateWebhookSecret } from '@/lib/developer/webhooks.server';

/**
 * POST /api/developer/webhooks/$id/rotate — issue a new signing secret, shown
 * once in this response. The old secret keeps signing for 24 hours (deliveries
 * carry both signatures), so a receiver can switch over without dropping events.
 */
export const route = apiRoute('/api/developer/webhooks/$id/rotate', {
  POST: implement(
    rotateWebhookSecretApi,
    { rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:developer/webhooks/:id/rotate' } },
    async ({ userId, params }) => {
      const rotated = await rotateWebhookSecret(userId, params.id);
      if (!rotated.ok) return Response.json({ error: rotated.error }, { status: rotated.status });
      return { endpoint: rotated.endpoint, secret: rotated.secret };
    },
  ),
});
