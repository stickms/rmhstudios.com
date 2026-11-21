import { apiRoute } from '@/lib/api/route.server';
import { apiError } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { getAdminJobApi } from '@/lib/admin/jobs.contract';
import {
  jobIdSchema,
  queueNameSchema,
} from '@/lib/admin/jobs-schema';
import {
  JobsUnavailableError,
  findQueue,
  getJob,
} from '@/lib/admin/jobs.server';

/** GET /api/admin/jobs/$queue/$id — one job's data, output and timestamps. Admin only. */
export const route =
  apiRoute(
    '/api/admin/jobs/$queue/$id',
    {
      GET: implement(
        getAdminJobApi,
        {
          auth: 'admin',
          rateLimit:
            'read',
        },
        async ({
          params,
        }) => {
          const queue =
            queueNameSchema.safeParse(
              params.queue,
            );
          const id =
            jobIdSchema.safeParse(
              params.id,
            );
          if (
            !queue.success ||
            !id.success
          )
            return apiError(
              'Job not found.',
              404,
            );
          try {
            if (
              !(await findQueue(
                queue.data,
              ))
            )
              return apiError(
                'Queue not found.',
                404,
              );
            const job =
              await getJob(
                queue.data,
                id.data,
              );
            return job
              ? {
                  job,
                }
              : apiError(
                  'Job not found.',
                  404,
                );
          } catch (e) {
            if (
              e instanceof
              JobsUnavailableError
            )
              return apiError(
                'The job queue is unavailable.',
                503,
              );
            throw e;
          }
        },
      ),
    },
  );
