import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { adminQuotaDecisionSchema } from '@/lib/library/admin-library-schema';
import { adminQuotaDecideApi, adminQuotaRequestsApi } from '@/lib/library/admin-library.contract';
import { listPendingQuotaRequests, decideQuotaRequest } from '@/lib/library/quota.server';

/**
 * /api/admin/library/quota-requests — admin review of upload-quota appeals.
 *   GET  — list pending appeals.
 *   POST — decide one ({ id, approve, grantedTotal? }).
 */
export const Route = createFileRoute('/api/admin/library/quota-requests')({
  server: {
    handlers: {
      GET: implement(adminQuotaRequestsApi, { auth: 'admin' }, async () => ({
        requests: await listPendingQuotaRequests(),
      })),
      POST: implement(
        adminQuotaDecideApi,
        {
          auth: 'admin',
          body: adminQuotaDecisionSchema,
          invalid: () => Response.json({ error: 'Missing request id.' }, { status: 400 }),
        },
        async ({ userId, body }) => {
          const result = await decideQuotaRequest(userId, body.id, body.approve, body.grantedTotal);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return { ok: true as const };
        },
      ),
    },
  },
});
