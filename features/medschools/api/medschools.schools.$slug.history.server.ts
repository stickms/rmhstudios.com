import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getMedSchoolHistoryApi } from '@features/medschools/medschools.contract';
import { historyQuery } from './read-schemas';
import { getHistory } from './read.server';

/** GET /api/medschools/schools/$slug/history: anonymous; the body never depends on the viewer, so a shared cache may keep it. */
export const route = apiRoute('/api/medschools/schools/$slug/history', {
  GET: implement(
    getMedSchoolHistoryApi,
    {
      auth: 'none',
      rateLimit: 'read',
      query: historyQuery,
      cache: { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 120 },
    },
    async ({ params, query }) => {
      const res = await getHistory(params.slug ?? '', query);
      return res ?? Response.json({ error: 'Not found' }, { status: 404 });
    },
  ),
});
