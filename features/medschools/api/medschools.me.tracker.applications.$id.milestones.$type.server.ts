import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteMedMilestoneApi, putMedMilestoneApi } from '@features/medschools/medschools.contract';
import type { MilestoneType } from '../engine/tracker';
import { milestoneTypeParam, putMilestoneBody } from './me-schemas';
import { TRACKER_WRITE_LIMIT, notFound, sharingGuard } from './me-http.server';
import { deleteMilestone, putMilestone } from './tracker.server';

const badInput = (): Response => Response.json({ error: 'Invalid input' }, { status: 400 });

/** PUT adds the milestone of a type or moves its date (one per type); DELETE removes it and its anonymous event. */
export const route = apiRoute('/api/medschools/me/tracker/applications/$id/milestones/$type', {
  PUT: implement(
    putMedMilestoneApi,
    { rateLimit: TRACKER_WRITE_LIMIT, body: putMilestoneBody },
    async ({ session, body, params }) => {
      const type = milestoneTypeParam.safeParse(params.type);
      if (!type.success) return badInput();
      return sharingGuard(async () => {
        const r = await putMilestone(session.user.id, params.id ?? '', type.data as MilestoneType, body.date);
        if (r === 'bad-date') return badInput();
        return r ?? notFound();
      });
    },
  ),
  DELETE: implement(deleteMedMilestoneApi, { rateLimit: TRACKER_WRITE_LIMIT }, async ({ session, params }) => {
    const type = milestoneTypeParam.safeParse(params.type);
    if (!type.success) return badInput();
    return sharingGuard(
      async () => (await deleteMilestone(session.user.id, params.id ?? '', type.data as MilestoneType)) ?? notFound(),
    );
  }),
});
