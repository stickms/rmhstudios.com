import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { confirmSweepApi } from '@/lib/admin/sweeps.contract';
import { SWEEP_CONFIRMS_PER_HOUR, SWEEP_CONFIRM_WINDOW_MS, SWEEP_REFUSAL_STATUS } from '@/lib/admin/sweeps';
import { SweepRefused, confirmSweep } from '@/lib/admin/sweeps.server';
import { enqueueSweepRun } from '@/lib/admin/sweeps-jobs.server';

/**
 * POST /api/admin/sweeps/$id — confirm a previewed sweep and start its durable run. Admin only. At most ten
 * confirms per admin per hour, so a compromised admin session cannot empty the site in a minute (the count is
 * also kept in the database, `confirmSweep`). A refusal answers `{ error, reason }`.
 */
export const route = apiRoute('/api/admin/sweeps/$id', {
  POST: implement(
    confirmSweepApi,
    {
      auth: 'admin',
      rateLimit: { limit: SWEEP_CONFIRMS_PER_HOUR, windowMs: SWEEP_CONFIRM_WINDOW_MS, prefix: 'admin-sweep' },
    },
    async ({ userId, params }) => {
      try {
        const sweep = await confirmSweep(userId, params.id);
        const queued = await enqueueSweepRun(sweep.id);
        return { sweep, queued };
      } catch (error) {
        if (error instanceof SweepRefused) {
          return Response.json(
            { error: 'This sweep cannot be started', reason: error.reason },
            { status: SWEEP_REFUSAL_STATUS[error.reason] },
          );
        }
        throw error;
      }
    },
  ),
});
