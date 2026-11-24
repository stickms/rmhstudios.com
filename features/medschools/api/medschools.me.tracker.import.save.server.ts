import { implement } from '@/lib/api/implement.server';
import { apiRoute } from '@/lib/api/route.server';
import { refusalBody } from '@/lib/errors/codes';
import { saveMedImportApi } from '@features/medschools/medschools.contract';
import { LIMITS } from '../engine/tracker';
import { importSaveBody } from './import-schemas';
import { TRACKER_WRITE_LIMIT, badInput, sharingGuard } from './me-http.server';
import { importMilestones } from './tracker.server';

/**
 * `POST /api/medschools/me/tracker/import/save`: the member's edited preview rows, written through the tracker's own
 * writer (`share-sync.server.ts` via `importMilestones`). The body names schools by slug, never an application, a cycle
 * or a user, so every row lands in the caller's own tracker. A date that conflicts with one already there is skipped
 * unless its row says `overwrite`. Sharing follows the cycle's own switch, as for a date typed by hand.
 */
export const route = apiRoute('/api/medschools/me/tracker/import/save', {
  POST: implement(
    saveMedImportApi,
    { rateLimit: TRACKER_WRITE_LIMIT, body: importSaveBody },
    async ({ userId, body }) =>
      sharingGuard(async () => {
        const r = await importMilestones(userId, body);
        if (r === null) return badInput();
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
