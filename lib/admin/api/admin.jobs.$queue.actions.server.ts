import { apiRoute } from '@/lib/api/route.server';
import { apiError } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { adminJobActionApi } from '@/lib/admin/jobs.contract';
import { parseIdList } from '@/lib/admin/jobs';
import { jobActionBodySchema, queueNameSchema } from '@/lib/admin/jobs-schema';
import { JobsUnavailableError, findQueue, runJobAction } from '@/lib/admin/jobs.server';

/**
 * POST /api/admin/jobs/$queue/actions — retry, cancel or delete one job or up to 100, audited as
 * `jobs.retry` / `jobs.cancel` / `jobs.delete`. Admin only.
 */
export const route = apiRoute('/api/admin/jobs/$queue/actions', {
  POST: implement(
    adminJobActionApi,
    {
      auth: 'admin',
      rateLimit: 'write',
      body: jobActionBodySchema,
    },
    async ({ params, body, userId }) => {
      const queue = queueNameSchema.safeParse(params.queue);
      if (!queue.success) return apiError('Queue not found.', 404);
      // The schema already refused a list that does not parse; this is the typed read of it.
      const ids = parseIdList(body.ids);
      if (!ids) return apiError('Invalid request.', 400);
      try {
        if (!(await findQueue(queue.data))) return apiError('Queue not found.', 404);
        return await runJobAction(userId, queue.data, body.action, ids);
      } catch (e) {
        if (e instanceof JobsUnavailableError) return apiError('The job queue is unavailable.', 503);
        throw e;
      }
    },
  ),
});
