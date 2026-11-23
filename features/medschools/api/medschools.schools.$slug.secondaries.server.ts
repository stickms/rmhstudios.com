import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getMedSchoolSecondariesApi } from '@features/medschools/medschools.contract';
import { secondariesQuery } from './secondaries-schemas';
import { getSchoolSecondaries } from './secondaries.server';

/**
 * GET /api/medschools/schools/$slug/secondaries: anonymous prompts, marks and attribution for one school. The body never
 * depends on the viewer (no session, preference or list is read), so a shared cache may keep it. The data changes at most
 * twice a week and a wait of minutes for a new prompt is fine.
 */
export const route = apiRoute('/api/medschools/schools/$slug/secondaries', {
  GET: implement(
    getMedSchoolSecondariesApi,
    {
      auth: 'none',
      rateLimit: 'read',
      query: secondariesQuery,
      cache: { visibility: 'public', maxAge: 300, sMaxAge: 900, staleWhileRevalidate: 3600 },
    },
    async ({ params, query }) => {
      const res = await getSchoolSecondaries(params.slug ?? '', query);
      return res ?? Response.json({ error: 'Not found' }, { status: 404 });
    },
  ),
});
