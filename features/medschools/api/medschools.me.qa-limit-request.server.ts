import { implement } from '@/lib/api/implement.server';
import { apiRoute } from '@/lib/api/route.server';
import { getMedQaLimitRequestApi, submitMedQaLimitRequestApi } from '@features/medschools/medschools.contract';
import { QA_LIMIT_WRITE_LIMIT, READ_LIMIT } from './me-http.server';
import { getLimitRequestState, submitLimitRequest } from './qa-limit.server';
import { limitRequestBody } from './qa-schemas';

/**
 * `/api/medschools/me/qa-limit-request` (plan R19): the Ask page's "Need more questions?" form. `GET` is the caller's
 * state (none, pending, approved, declined with the day they can ask again, or not-needed for an admin and a paying
 * member); `POST` files a request with an optional reason of at most 500 characters. Signed in, personal, never cached.
 * A request holds no question text.
 */
export const route = apiRoute('/api/medschools/me/qa-limit-request', {
  GET: implement(getMedQaLimitRequestApi, { rateLimit: READ_LIMIT }, async ({ userId, isAdmin }) =>
    getLimitRequestState(userId, isAdmin),
  ),
  POST: implement(
    submitMedQaLimitRequestApi,
    { rateLimit: QA_LIMIT_WRITE_LIMIT, body: limitRequestBody },
    async ({ userId, isAdmin, body }) => submitLimitRequest(userId, isAdmin, body.note),
  ),
});
