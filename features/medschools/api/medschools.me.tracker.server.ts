import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getMedTrackerApi } from '@features/medschools/medschools.contract';
import { getTrackerQuery } from './me-schemas';
import { READ_LIMIT } from './me-http.server';
import { getTracker } from './tracker.server';

/** GET /api/medschools/me/tracker: the caller's tracker. Personal, so it declares no `cache` (never stored anywhere). */
export const route = apiRoute('/api/medschools/me/tracker', {
  GET: implement(getMedTrackerApi, { rateLimit: READ_LIMIT, query: getTrackerQuery }, async ({ session, query }) =>
    getTracker(session.user.id, query.cycle),
  ),
});
