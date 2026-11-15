import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { getLibraryQuotaApi, requestLibraryQuotaApi } from '@/lib/library/upload.contract';
import { getQuotaStatus, requestQuota } from '@/lib/library/quota.server';

/**
 * /api/library/quota
 *   GET  — the signed-in user's library usage, cap, own uploads, pending appeal.
 *   POST — file an appeal for a higher cap ({ requestedTotal, reason }).
 */

/**
 * `requestQuota` owns the validation and answers with the reason, so a bad
 * number or a missing reason must reach it as NaN / '' rather than a bare 400.
 */
const appealBody = z.object({
  requestedTotal: z.coerce.number().catch(Number.NaN),
  reason: z.string().catch(''),
});

export const route = apiRoute('/api/library/quota', {
  GET: implement(getLibraryQuotaApi, {}, async ({ userId, isAdmin }) =>
    getQuotaStatus(userId, isAdmin),
  ),
  POST: implement(
    requestLibraryQuotaApi,
    { body: appealBody, allowEmptyBody: true },
    async ({ userId, body }) => {
      const result = await requestQuota(userId, body.requestedTotal, body.reason);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
      return { ok: true as const };
    },
  ),
});
