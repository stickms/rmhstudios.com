import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getMedRollingGuidanceApi } from '@features/medschools/medschools.contract';
import { READ_LIMIT, notFound } from './me-http.server';
import { overlapQuery } from './secondaries-schemas';
import { getRollingGuidance } from './rolling-guidance.server';

/**
 * GET /api/medschools/me/rolling: what the caller's own list or tracker schools say about rolling decisions (each
 * school's own page, quoted). Personal, so it declares no `cache` (never stored anywhere). Another member's list id is a
 * 404, the same as an unknown one.
 */
export const route = apiRoute('/api/medschools/me/rolling', {
  GET: implement(
    getMedRollingGuidanceApi,
    { rateLimit: READ_LIMIT, query: overlapQuery },
    async ({ session, query }) => {
      const r = await getRollingGuidance(
        session.user.id,
        query.source === 'list' ? { source: 'list', list: query.list ?? '' } : { source: 'tracker' },
      );
      return r === 'not-found' ? notFound() : r;
    },
  ),
});
