import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getMedSchoolApi } from '@features/medschools/medschools.contract';
import { getSchool } from './read.server';

/** GET /api/medschools/schools/$slug: anonymous; the body never depends on the viewer, so a shared cache may keep it. */
export const route = apiRoute('/api/medschools/schools/$slug', {
  GET: implement(
    getMedSchoolApi,
    {
      auth: 'none',
      rateLimit: 'read',
      cache: { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 120 },
    },
    async ({ params }) => {
      const res = await getSchool(params.slug ?? '');
      return res ?? Response.json({ error: 'Not found' }, { status: 404 });
    },
  ),
});
