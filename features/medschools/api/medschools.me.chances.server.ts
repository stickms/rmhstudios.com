import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getMedChancesApi } from '@features/medschools/medschools.contract';
import { getChancesQuery } from './me-schemas';
import { READ_LIMIT } from './me-http.server';
import { getChances } from './chances.server';

/**
 * GET /api/medschools/me/chances: the caller's own invite chances. Personal, so it declares no `cache` (never stored
 * anywhere). It reads the caller's tracker and aggregate curve rows only; there is no id parameter to point elsewhere.
 */
export const route = apiRoute('/api/medschools/me/chances', {
  GET: implement(getMedChancesApi, { rateLimit: READ_LIMIT, query: getChancesQuery }, async ({ session, query }) =>
    getChances(session.user.id, query),
  ),
});
