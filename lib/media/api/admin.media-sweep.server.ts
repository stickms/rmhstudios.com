import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { mediaSweepStateApi } from '@/lib/media/sweep-admin.contract';
import { listSweepRuns } from '@/lib/media/sweep-admin.server';

/** GET /api/admin/media-sweep — whether the scheduled sweeps are on, and the last five runs. */
export const route = apiRoute('/api/admin/media-sweep', {
  GET: implement(mediaSweepStateApi, { auth: 'admin', rateLimit: 'read' }, async () => listSweepRuns()),
});
