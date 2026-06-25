import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { listPendingQuotaRequests, decideQuotaRequest } from '@/lib/library/quota.server';

/**
 * /api/admin/library/quota-requests — admin review of upload-quota appeals.
 *   GET  — list pending appeals.
 *   POST — decide one ({ id, approve, grantedTotal? }).
 */
async function requireAdmin(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) return null;
  return session;
}

export const Route = createFileRoute('/api/admin/library/quota-requests')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 });
        const requests = await listPendingQuotaRequests();
        return Response.json({ requests });
      },
      POST: async ({ request }) => {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as {
          id?: unknown;
          approve?: unknown;
          grantedTotal?: unknown;
        };
        if (typeof body.id !== 'string') return Response.json({ error: 'Missing request id.' }, { status: 400 });
        const granted = body.grantedTotal === undefined ? undefined : Number(body.grantedTotal);
        const result = await decideQuotaRequest(session.user.id, body.id, Boolean(body.approve), granted);
        if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
        return Response.json({ ok: true });
      },
    },
  },
});
