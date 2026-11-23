import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteMedTrackerCycleApi, putMedTrackerCycleApi } from '@features/medschools/medschools.contract';
import { deleteCycleQuery, putCycleBody } from './me-schemas';
import { SHARE_LIMIT, notFound, sharingGuard } from './me-http.server';
import { deleteCycle, putCycle } from './tracker.server';

/** PUT creates the cycle or changes its home state and sharing switch; DELETE removes it and its anonymous events. */
export const route = apiRoute('/api/medschools/me/tracker/cycle', {
  PUT: implement(putMedTrackerCycleApi, { rateLimit: SHARE_LIMIT, body: putCycleBody }, async ({ session, body }) =>
    sharingGuard(() => putCycle(session.user.id, body)),
  ),
  DELETE: implement(
    deleteMedTrackerCycleApi,
    { rateLimit: SHARE_LIMIT, query: deleteCycleQuery },
    async ({ session, query }) =>
      sharingGuard(async () =>
        (await deleteCycle(session.user.id, query.cycleYear)) ? { ok: true as const } : notFound(),
      ),
  ),
});
