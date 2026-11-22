import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { mediaSweepPreviewApi } from '@/lib/media/sweep-admin.contract';
import { sweepKindBody } from '@/lib/media/sweep-admin-schema';
import { previewSweep } from '@/lib/media/sweep-jobs.server';

/** POST /api/admin/media-sweep/preview { kind } — what a run would delete; deletes nothing. */
export const route = apiRoute('/api/admin/media-sweep/preview', {
  POST: implement(
    mediaSweepPreviewApi,
    { auth: 'admin', rateLimit: { limit: 10, windowMs: 60_000, prefix: 'media-sweep-preview' }, body: sweepKindBody },
    async ({ body }) => ({ kind: body.kind, summary: await previewSweep(body.kind) }),
  ),
});
