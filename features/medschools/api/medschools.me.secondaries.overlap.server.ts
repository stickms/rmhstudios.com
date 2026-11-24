import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getMedSecondaryOverlapApi } from '@features/medschools/medschools.contract';
import { READ_LIMIT, notFound } from './me-http.server';
import { overlapQuery } from './secondaries-schemas';
import { getOverlap } from './secondaries-overlap.server';

/**
 * GET /api/medschools/me/secondaries/overlap: the prompts of the caller's own list or tracker schools grouped by theme.
 * Personal, so it declares no `cache` (never stored anywhere). Another member's list id is a 404, the same as an unknown one.
 */
export const route = apiRoute('/api/medschools/me/secondaries/overlap', {
  GET: implement(
    getMedSecondaryOverlapApi,
    { rateLimit: READ_LIMIT, query: overlapQuery },
    async ({ session, query }) => {
      const r = await getOverlap(
        session.user.id,
        query.source === 'list' ? { source: 'list', list: query.list ?? '' } : { source: 'tracker' },
      );
      return r === 'not-found' ? notFound() : r;
    },
  ),
});
