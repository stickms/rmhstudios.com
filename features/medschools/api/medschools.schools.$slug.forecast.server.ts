import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getMedSchoolForecastApi } from '@features/medschools/medschools.contract';
import { forecastQuery } from './read-schemas';
import { getForecast } from './read.server';

/**
 * GET /api/medschools/schools/$slug/forecast: anonymous. The body is a stored forecast plus the floored observed
 * series and never depends on the viewer, so a shared cache may keep it. The forecast is computed once a day.
 */
export const route = apiRoute('/api/medschools/schools/$slug/forecast', {
  GET: implement(
    getMedSchoolForecastApi,
    {
      auth: 'none',
      rateLimit: 'read',
      query: forecastQuery,
      cache: { visibility: 'public', maxAge: 300, sMaxAge: 600, staleWhileRevalidate: 1800 },
    },
    async ({ params, query }) => {
      const res = await getForecast(params.slug ?? '', query);
      return res ?? Response.json({ error: 'Not found' }, { status: 404 });
    },
  ),
});
