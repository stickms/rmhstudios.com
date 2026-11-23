import { implement } from '@/lib/api/implement.server';
import { apiRoute } from '@/lib/api/route.server';
import { decideMedQaLimitRequestApi, listMedQaLimitRequestsApi } from '@features/medschools/medschools.contract';
import { decideLimitRequest, listLimitRequests } from './qa-limit.server';
import { limitDecisionBody } from './qa-schemas';

/**
 * `/api/admin/medschools/qa-limit-requests` (plan R19): admin review of Q&A limit requests, the sibling of the library's
 * quota requests. `GET` lists pending requests and the recent decisions; `POST` approves or declines a pending one, or
 * revokes an approval, with an optional note the member sees. Admins only.
 */
export const route = apiRoute('/api/admin/medschools/qa-limit-requests', {
  GET: implement(listMedQaLimitRequestsApi, { auth: 'admin' }, async () => listLimitRequests()),
  POST: implement(
    decideMedQaLimitRequestApi,
    { auth: 'admin', rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:admin/medschools-qa-limit' }, body: limitDecisionBody },
    async ({ userId, body }) => {
      await decideLimitRequest(userId, body);
      return { ok: true as const };
    },
  ),
});
