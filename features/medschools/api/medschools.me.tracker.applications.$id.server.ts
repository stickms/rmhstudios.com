import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteMedApplicationApi, patchMedApplicationApi } from '@features/medschools/medschools.contract';
import { patchApplicationBody } from './me-schemas';
import { SHARE_LIMIT, TRACKER_WRITE_LIMIT, notFound, sharingGuard } from './me-http.server';
import { deleteApplication, patchApplication } from './tracker.server';

/** PATCH changes the notes (school and program are fixed: remove and add instead); DELETE removes the row and its events. */
export const route = apiRoute('/api/medschools/me/tracker/applications/$id', {
  PATCH: implement(
    patchMedApplicationApi,
    { rateLimit: TRACKER_WRITE_LIMIT, body: patchApplicationBody },
    async ({ session, body, params }) =>
      sharingGuard(async () => (await patchApplication(session.user.id, params.id ?? '', body.notes)) ?? notFound()),
  ),
  DELETE: implement(deleteMedApplicationApi, { rateLimit: SHARE_LIMIT }, async ({ session, params }) =>
    sharingGuard(async () =>
      (await deleteApplication(session.user.id, params.id ?? '')) ? { ok: true as const } : notFound(),
    ),
  ),
});
