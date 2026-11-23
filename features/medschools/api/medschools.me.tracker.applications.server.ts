import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { addMedApplicationApi } from '@features/medschools/medschools.contract';
import { LIMITS } from '../engine/tracker';
import { addApplicationBody } from './me-schemas';
import { TRACKER_WRITE_LIMIT, notFound, sharingGuard } from './me-http.server';
import { addApplication } from './tracker.server';

/** POST adds a school and program to a cycle. */
export const route = apiRoute('/api/medschools/me/tracker/applications', {
  POST: implement(
    addMedApplicationApi,
    { rateLimit: TRACKER_WRITE_LIMIT, body: addApplicationBody },
    async ({ session, body }) =>
      sharingGuard(async () => {
        const r = await addApplication(session.user.id, body);
        if (r === 'duplicate') return Response.json({ ...refusalBody('MEDSCHOOLS_DUPLICATE') }, { status: 409 });
        if (r === 'cap') {
          return Response.json(
            { ...refusalBody('MEDSCHOOLS_CAP', { max: LIMITS.applicationsPerCycle }) },
            { status: 409 },
          );
        }
        if (r === 'cycle-missing' || r === 'school-missing') return notFound();
        return r;
      }),
  ),
});
