import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listMedSchoolsApi } from '@features/medschools/medschools.contract';
import { listSchoolsQuery } from './read-schemas';
import { listSchools } from './read.server';

/** GET /api/medschools/schools: anonymous; the body never depends on the viewer, so a shared cache may keep it. */
export const route = apiRoute('/api/medschools/schools', {
  GET: implement(
    listMedSchoolsApi,
    {
      auth: 'optional',
      rateLimit: 'read',
      query: listSchoolsQuery,
      cache: { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 120 },
    },
    async ({ query }) => listSchools(query),
  ),
});
