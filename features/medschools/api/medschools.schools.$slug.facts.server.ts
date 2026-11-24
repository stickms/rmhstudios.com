import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getMedSchoolFactsApi } from '@features/medschools/medschools.contract';
import { getSchoolFacts } from './school-facts.server';

/**
 * GET /api/medschools/schools/$slug/facts: the school's AAMC MSAR report facts, each with its source line and the day it
 * was read. Institutional data: the body never depends on the viewer (no session, preference or list is read), so a shared
 * cache may keep it. It changes only when a new file version is deployed, so the cache is long.
 */
export const route = apiRoute('/api/medschools/schools/$slug/facts', {
  GET: implement(
    getMedSchoolFactsApi,
    {
      auth: 'none',
      rateLimit: 'read',
      cache: { visibility: 'public', maxAge: 600, sMaxAge: 3600, staleWhileRevalidate: 86400 },
    },
    async ({ params }) => {
      const res = await getSchoolFacts(params.slug ?? '');
      return res ?? Response.json({ error: 'Not found' }, { status: 404 });
    },
  ),
});
