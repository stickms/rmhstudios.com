import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getMedSchoolActivityApi } from '@features/medschools/medschools.contract';
import { activityQuery } from './read-schemas';
import { getActivity } from './read.server';

/** GET /api/medschools/schools/$slug/activity: anonymous; the body never depends on the viewer, so a shared cache may keep it. */
export const route = apiRoute('/api/medschools/schools/$slug/activity', {
  GET: implement(
    getMedSchoolActivityApi,
    {
      auth: 'optional',
      rateLimit: 'read',
      query: activityQuery,
      cache: { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 120 },
    },
    async ({ params, query }) => {
      const res = await getActivity(params.slug ?? '', query);
      return res ?? Response.json({ error: 'Not found' }, { status: 404 });
    },
  ),
});
