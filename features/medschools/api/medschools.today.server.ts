import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getMedTodayApi } from '@features/medschools/medschools.contract';
import { todayQuery } from './read-schemas';
import { getToday } from './read.server';

/** GET /api/medschools/today: anonymous; the body never depends on the viewer, so a shared cache may keep it. */
export const route = apiRoute('/api/medschools/today', {
  GET: implement(
    getMedTodayApi,
    {
      auth: 'none',
      rateLimit: 'read',
      query: todayQuery,
      cache: { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 120 },
    },
    async ({ query }) => getToday(query),
  ),
});
