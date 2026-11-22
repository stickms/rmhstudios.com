import { apiRoute } from '@/lib/api/route.server';
import { apiError } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { listAdminQueueJobsApi } from '@/lib/admin/jobs.contract';
import { listJobsQuerySchema, queueNameSchema } from '@/lib/admin/jobs-schema';
import { JobsUnavailableError, findQueue, listJobs } from '@/lib/admin/jobs.server';

/**
 * GET /api/admin/jobs/$queue?state=failed|retry|active|created&after= — one page of a queue's jobs
 * in a state, newest first. Admin only.
 */
export const route = apiRoute('/api/admin/jobs/$queue', {
  GET: implement(
    listAdminQueueJobsApi,
    {
      auth: 'admin',
      rateLimit: 'read',
      query: listJobsQuerySchema,
    },
    async ({ params, query }) => {
      const queue = queueNameSchema.safeParse(params.queue);
      if (!queue.success) return apiError('Queue not found.', 404);
      try {
        if (!(await findQueue(queue.data))) return apiError('Queue not found.', 404);
        return await listJobs(queue.data, query.state, query.after);
      } catch (e) {
        if (e instanceof JobsUnavailableError) return apiError('The job queue is unavailable.', 503);
        throw e;
      }
    },
  ),
});
