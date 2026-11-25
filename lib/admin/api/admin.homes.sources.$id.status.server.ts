import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody, ERROR_CODES } from '@/lib/errors/codes';
import { setAdminHomeSourceStatusApi } from '@/lib/admin/homes.contract';
import { sourceStatusBody } from '@/lib/admin/homes-schema';
import { setSourceStatus } from '@/lib/admin/homes.server';

/**
 * POST /api/admin/homes/sources/$id/status — `{ action: 'pause' | 'resume', seen }`: a compare-and-set on the status
 * the admin saw (a stale one answers CONFLICT). Admin only; audited in the same transaction.
 */
export const route = apiRoute('/api/admin/homes/sources/$id/status', {
  POST: implement(
    setAdminHomeSourceStatusApi,
    { auth: 'admin', rateLimit: 'write', body: sourceStatusBody },
    async ({ params, session, body }) => {
      const out = await setSourceStatus(session.user.id, params.id, body.action, body.seen);
      if (!out.ok) return Response.json({ ...refusalBody(out.code) }, { status: ERROR_CODES[out.code].http });
      return { source: out.source };
    },
  ),
});
