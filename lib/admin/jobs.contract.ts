/** Contracts for the background jobs console. Client-safe: types only, by `import type`. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { FanoutSummary, JobDetail, JobRow, QueueSummary } from '@/lib/admin/jobs';
import type { jobActionBodySchema, listJobsQuerySchema } from '@/lib/admin/jobs-schema';

export const listAdminJobQueuesApi = endpoint<{
  res: {
    queues: QueueSummary[];
    /** Additive (s08-05): the durable fan-out runs. */
    fanouts: FanoutSummary;
  };
}>()({
  method: 'GET',
  path: '/api/admin/jobs',
});

export const listAdminQueueJobsApi = endpoint<{
  query: z.infer<typeof listJobsQuerySchema>;
  res: {
    jobs: JobRow[];
    nextCursor: string | null;
  };
}>()({
  method: 'GET',
  path: '/api/admin/jobs/$queue',
});

export const getAdminJobApi = endpoint<{
  res: {
    job: JobDetail;
  };
}>()({
  method: 'GET',
  path: '/api/admin/jobs/$queue/$id',
});

export const adminJobActionApi = endpoint<{
  body: z.infer<typeof jobActionBodySchema>;
  res: {
    requested: number;
    affected: number;
  };
}>()({
  method: 'POST',
  path: '/api/admin/jobs/$queue/actions',
});
