/** `GET /api/rmhtype/progress` - the caller's daily medians, summary and personal bests. */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getRmhTypeProgressApi } from '@/lib/rmhtype/progress.contract';
import { progressQuery } from '@/lib/rmhtype/progress-schema';
import { getProgress } from '@/lib/rmhtype/progress.server';

export const route = apiRoute('/api/rmhtype/progress', {
  GET: implement(
    getRmhTypeProgressApi,
    {
      rateLimit: 'read',
      query: progressQuery,
    },
    async ({ userId, query }) => getProgress(userId, query),
  ),
});
