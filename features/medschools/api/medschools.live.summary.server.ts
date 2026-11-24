import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getMedLiveSummaryApi } from '@features/medschools/medschools.contract';
import { liveSummaryQuery } from './read-schemas';
import { getLiveSummary } from './live-summary.server';

/** GET /api/medschools/live/summary: the live page's "Today" column. Anonymous; the body never depends on the viewer. */
export const route = apiRoute('/api/medschools/live/summary', {
  GET: implement(
    getMedLiveSummaryApi,
    {
      auth: 'none',
      rateLimit: 'read',
      query: liveSummaryQuery,
      cache: { visibility: 'public', maxAge: 15, sMaxAge: 15, staleWhileRevalidate: 30 },
    },
    async ({ query }) => getLiveSummary(query),
  ),
});
