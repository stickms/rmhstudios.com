import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getAdminWebhookApi, patchAdminWebhookApi } from '@/lib/admin/webhooks.contract';
import { webhookPatchBody } from '@/lib/admin/webhooks-schema';
import { adminDisableWebhook, getWebhookDetail, liftWebhookDisable } from '@/lib/admin/webhooks.server';

/**
 * GET   /api/admin/webhooks/$id — the endpoint and its last 50 deliveries (error text redacted of the URL).
 * PATCH /api/admin/webhooks/$id — `{ disable: { reason } }` turns it off for its owner with a reason they read;
 *       `{ disable: null }` lifts that and leaves the endpoint off. Admin only; each change is audited in the same
 *       transaction.
 */
export const route = apiRoute('/api/admin/webhooks/$id', {
  GET: implement(getAdminWebhookApi, { auth: 'admin', rateLimit: 'read' }, async ({ params }) => {
    const detail = await getWebhookDetail(params.id);
    if (!detail) return Response.json({ error: 'Webhook not found' }, { status: 404 });
    return detail;
  }),

  PATCH: implement(
    patchAdminWebhookApi,
    { auth: 'admin', rateLimit: 'write', body: webhookPatchBody },
    async ({ params, session, body }) => {
      const out = body.disable
        ? await adminDisableWebhook(session.user.id, params.id, body.disable.reason)
        : await liftWebhookDisable(session.user.id, params.id);
      if (!out.ok) return Response.json({ error: out.error }, { status: out.status });
      return { webhook: out.webhook };
    },
  ),
});
