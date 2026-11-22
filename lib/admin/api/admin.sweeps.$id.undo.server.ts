import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { undoSweepApi } from '@/lib/admin/sweeps.contract';
import { SWEEP_REFUSAL_STATUS } from '@/lib/admin/sweeps';
import { SweepRefused, undoSweep } from '@/lib/admin/sweeps.server';
import { enqueueSweepRun } from '@/lib/admin/sweeps-jobs.server';

/**
 * POST /api/admin/sweeps/$id/undo — restore what a finished sweep removed (only the items still in the state
 * the sweep left them), void its strike and tell the member once. Refused once the member's account is
 * deleted. Admin only. A refusal answers `{ error, reason }`.
 */
export const route = apiRoute('/api/admin/sweeps/$id/undo', {
  POST: implement(undoSweepApi, { auth: 'admin', rateLimit: 'write' }, async ({ userId, params }) => {
    try {
      const sweep = await undoSweep(userId, params.id);
      const queued = await enqueueSweepRun(sweep.id);
      return { sweep, queued };
    } catch (error) {
      if (error instanceof SweepRefused) {
        return Response.json(
          { error: 'This sweep cannot be undone', reason: error.reason },
          { status: SWEEP_REFUSAL_STATUS[error.reason] },
        );
      }
      throw error;
    }
  }),
});
