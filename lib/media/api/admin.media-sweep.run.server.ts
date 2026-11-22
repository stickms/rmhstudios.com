import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { mediaSweepRunApi } from '@/lib/media/sweep-admin.contract';
import { sweepKindBody } from '@/lib/media/sweep-admin-schema';
import { runSweepNow } from '@/lib/media/sweep-jobs.server';

/** POST /api/admin/media-sweep/run { kind } — run the sweep now; the flag does not apply. Audited. */
export const route = apiRoute('/api/admin/media-sweep/run', {
  POST: implement(
    mediaSweepRunApi,
    { auth: 'admin', rateLimit: { limit: 3, windowMs: 60_000, prefix: 'media-sweep-run' }, body: sweepKindBody },
    async ({ userId, body }) => ({ kind: body.kind, summary: await runSweepNow(body.kind, userId) }),
  ),
});
