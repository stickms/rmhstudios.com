import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { addMedListToTrackerApi } from '@features/medschools/medschools.contract';
import { LIMITS } from '../engine/tracker';
import { addListToTrackerBody } from './me-schemas';
import { ADD_TO_TRACKER_LIMIT, notFound, sharingGuard } from './me-http.server';
import { addListToTracker } from './lists.server';

/** POST copies the list's schools into a tracker cycle (sharing off for a new cycle). All or nothing; idempotent. */
export const route = apiRoute('/api/medschools/me/lists/$id/add-to-tracker', {
  POST: implement(
    addMedListToTrackerApi,
    { rateLimit: ADD_TO_TRACKER_LIMIT, body: addListToTrackerBody },
    async ({ session, body, params }) =>
      sharingGuard(async () => {
        const r = await addListToTracker(session.user.id, params.id ?? '', body.cycleYear);
        if (r === null) return notFound();
        if ('cap' in r) {
          return Response.json(
            { ...refusalBody('MEDSCHOOLS_CAP', { max: LIMITS.applicationsPerCycle, ...r.cap }) },
            { status: 409 },
          );
        }
        return r;
      }),
  ),
});
