import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';
import { retryAdminErasureApi } from '@/lib/admin/deletions.contract';
import { retryParams } from '@/lib/admin/deletions-schema';
import { retryErasure } from '@/lib/admin/deletions.server';

/**
 * POST /api/admin/deletions/$userId/retry — run the erasure of one OVERDUE account now (trigger `admin`). An account
 * still in its grace period is refused (ERASURE_NOT_OVERDUE: there is no "delete now"), and so is one whose erasure is
 * already running (ERASURE_IN_PROGRESS). Admin only; audited as `account.erasure.retry` in the attempt's transaction.
 */
export const route = apiRoute('/api/admin/deletions/$userId/retry', {
  POST: implement(retryAdminErasureApi, { auth: 'admin', rateLimit: 'write' }, async ({ params, session }) => {
    const parsed = retryParams.safeParse(params);
    if (!parsed.success)
      return Response.json({ ...refusalBody('INVALID_INPUT') }, { status: ERROR_CODES.INVALID_INPUT.http });
    const out = await retryErasure(session.user.id, parsed.data.userId);
    if (!out.ok) return Response.json({ ...refusalBody(out.code) }, { status: ERROR_CODES[out.code].http });
    return out.result;
  }),
});
