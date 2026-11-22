import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteWebhookApi, getWebhookApi, updateWebhookApi } from '@/lib/developer/webhooks.contract';
import { deliveriesQuery, patchWebhookBody } from '@/lib/developer/webhooks-schema';
import { deleteWebhook, getWebhook, updateWebhook } from '@/lib/developer/webhooks.server';

const writeLimit = {
  policy: 'write',
  scope: 'user',
  prefix: 'mutation:developer/webhooks/:id',
} as const;

/**
 * GET    /api/developer/webhooks/$id — one endpoint and a page of its deliveries
 *        (`status`, `event`, `cursor`).
 * PATCH  /api/developer/webhooks/$id — edit, enable or disable (enabling resets the failure count).
 * DELETE /api/developer/webhooks/$id — remove the endpoint and its delivery log.
 * A foreign or unknown id is a 404 on all three.
 */
export const route = apiRoute('/api/developer/webhooks/$id', {
  GET: implement(getWebhookApi, { rateLimit: 'read', query: deliveriesQuery }, async ({ userId, params, query }) => {
    const found = await getWebhook(userId, params.id, query);
    if (!found.ok) return Response.json({ error: found.error }, { status: found.status });
    return { endpoint: found.endpoint, deliveries: found.deliveries, nextCursor: found.nextCursor };
  }),

  PATCH: implement(
    updateWebhookApi,
    { rateLimit: writeLimit, body: patchWebhookBody },
    async ({ userId, params, body }) => {
      const updated = await updateWebhook(userId, params.id, body);
      if (!updated.ok) return Response.json({ error: updated.error }, { status: updated.status });
      return { endpoint: updated.endpoint };
    },
  ),

  DELETE: implement(deleteWebhookApi, { rateLimit: writeLimit }, async ({ userId, params }) => {
    const removed = await deleteWebhook(userId, params.id);
    if (!removed.ok) return Response.json({ error: removed.error }, { status: removed.status });
    return { success: true as const };
  }),
});
