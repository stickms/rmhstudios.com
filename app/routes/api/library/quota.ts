import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { getQuotaStatus, requestQuota } from '@/lib/library/quota.server';

/**
 * /api/library/quota
 *   GET  — the signed-in user's library usage, cap, own uploads, pending appeal.
 *   POST — file an appeal for a higher cap ({ requestedTotal, reason }).
 */
async function getViewer(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  return { id: session.user.id, isAdmin: Boolean((session.user as { isAdmin?: boolean }).isAdmin) };
}

export const Route = createFileRoute('/api/library/quota')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const viewer = await getViewer(request);
        if (!viewer) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const status = await getQuotaStatus(viewer.id, viewer.isAdmin);
        return Response.json(status);
      },
      POST: async ({ request }) => {
        const viewer = await getViewer(request);
        if (!viewer) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { requestedTotal?: unknown; reason?: unknown };
        const requestedTotal = Number(body.requestedTotal);
        const reason = typeof body.reason === 'string' ? body.reason : '';
        const result = await requestQuota(viewer.id, requestedTotal, reason);
        if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
        return Response.json({ ok: true });
      },
    },
  },
});
