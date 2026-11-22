import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getMedLiveApi } from '@features/medschools/medschools.contract';
import { liveQuery } from './read-schemas';
import { getLive } from './read.server';

/** GET /api/medschools/live: anonymous; the body never depends on the viewer, so a shared cache may keep it. */
export const route = apiRoute('/api/medschools/live', {
  GET: implement(
    getMedLiveApi,
    {
      auth: 'optional',
      rateLimit: 'read',
      query: liveQuery,
      cache: { visibility: 'public', maxAge: 15, sMaxAge: 15, staleWhileRevalidate: 30 },
    },
    async ({ query }) => getLive(query),
  ),
});
