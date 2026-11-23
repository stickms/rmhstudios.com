import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getMedSchoolArrivalsApi } from '@features/medschools/medschools.contract';
import { arrivalsQuery } from './read-schemas';
import { getArrivals } from './read.server';

/**
 * GET /api/medschools/schools/$slug/arrivals: anonymous; aggregates only (weekday, hour and per-cycle day counts), so
 * the body never depends on the viewer and a shared cache may keep it.
 */
export const route = apiRoute('/api/medschools/schools/$slug/arrivals', {
  GET: implement(
    getMedSchoolArrivalsApi,
    {
      auth: 'none',
      rateLimit: 'read',
      query: arrivalsQuery,
      cache: { visibility: 'public', maxAge: 60, sMaxAge: 300, staleWhileRevalidate: 600 },
    },
    async ({ params, query }) => {
      const res = await getArrivals(params.slug ?? '', query);
      return res ?? Response.json({ error: 'Not found' }, { status: 404 });
    },
  ),
});
