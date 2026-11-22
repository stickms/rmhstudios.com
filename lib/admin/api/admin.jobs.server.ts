import { apiRoute } from '@/lib/api/route.server';
import { apiError } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { listAdminJobQueuesApi } from '@/lib/admin/jobs.contract';
import { JobsUnavailableError, listQueues } from '@/lib/admin/jobs.server';

/** GET /api/admin/jobs — every pg-boss queue with its counts and schedules. Admin only. */
export const route = apiRoute('/api/admin/jobs', {
  GET: implement(
    listAdminJobQueuesApi,
    {
      auth: 'admin',
      rateLimit: 'read',
    },
    async () => {
      try {
        return {
          queues: await listQueues(),
        };
      } catch (e) {
        if (e instanceof JobsUnavailableError) return apiError('The job queue is unavailable.', 503);
        throw e;
      }
    },
  ),
});
