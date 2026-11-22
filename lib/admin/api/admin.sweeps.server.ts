import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listSweepsApi, previewSweepApi } from '@/lib/admin/sweeps.contract';
import { createSweepBody, listSweepsQuery } from '@/lib/admin/sweeps-schema';
import { SWEEP_REFUSAL_STATUS } from '@/lib/admin/sweeps';
import { SweepRefused, createSweepPreview, listSweeps } from '@/lib/admin/sweeps.server';

/**
 * GET /api/admin/sweeps — the spam sweeps, newest first (50); `?subject=` narrows to one member. Admin only.
 *
 * POST /api/admin/sweeps — preview a sweep of a member's posts and replies in a window (default the last 24
 * hours, at most 30 days): counts, the ten newest items, the account's age and strikes. Changes nothing but
 * the PREVIEW row. An admin account cannot be a subject. Admin only.
 */
export const route = apiRoute('/api/admin/sweeps', {
  GET: implement(listSweepsApi, { auth: 'admin', rateLimit: 'read', query: listSweepsQuery }, async ({ query }) => ({
    sweeps: await listSweeps({ subject: query.subject }),
  })),
  POST: implement(
    previewSweepApi,
    { auth: 'admin', rateLimit: 'write', body: createSweepBody },
    async ({ userId, body }) => {
      try {
        return await createSweepPreview(userId, body);
      } catch (error) {
        if (error instanceof SweepRefused) {
          return Response.json(
            { error: 'This sweep cannot be previewed', reason: error.reason },
            { status: SWEEP_REFUSAL_STATUS[error.reason] },
          );
        }
        throw error;
      }
    },
  ),
});
