/** `GET /api/rmhtype/progress/runs` - one page of the caller's runs, newest first. */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getRmhTypeRunsApi } from '@/lib/rmhtype/progress.contract';
import { progressRunsQuery } from '@/lib/rmhtype/progress-schema';
import { getRuns } from '@/lib/rmhtype/progress.server';

export const route = apiRoute('/api/rmhtype/progress/runs', {
  GET: implement(
    getRmhTypeRunsApi,
    {
      rateLimit: 'read',
      query: progressRunsQuery,
    },
    async ({ userId, query }) => getRuns(userId, query),
  ),
});
