import { apiRoute } from '@/lib/api/route.server';
import { apiError } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { adminOutboxActionApi } from '@/lib/admin/outbox.contract';
import { outboxActionBodySchema } from '@/lib/admin/outbox-admin-schema';
import { parseEventIds } from '@/lib/admin/outbox-admin';
import { runOutboxAction } from '@/lib/admin/outbox-admin.server';

/**
 * POST /api/admin/outbox/actions — requeue or discard dead events: up to 100 by id, or (requeue only)
 * up to 500 dead events of one topic. Audited as `outbox.requeue` / `outbox.discard`. Admin only.
 */
export const route = apiRoute('/api/admin/outbox/actions', {
  POST: implement(
    adminOutboxActionApi,
    {
      auth: 'admin',
      rateLimit: 'write',
      body: outboxActionBodySchema,
    },
    async ({ body, userId }) => {
      if (body.ids !== undefined) {
        // The schema already refused a list that does not parse; this is the typed read of it.
        const ids = parseEventIds(body.ids);
        if (!ids) return apiError('Invalid request.', 400);
        return runOutboxAction(userId, body.action, {
          ids,
        });
      }
      if (body.topic === undefined) return apiError('Invalid request.', 400);
      return runOutboxAction(userId, body.action, {
        topic: body.topic,
        allDead: true,
      });
    },
  ),
});
