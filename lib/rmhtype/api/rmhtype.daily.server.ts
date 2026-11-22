/** `GET /api/rmhtype/daily` - today's state for the caller. */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getRmhTypeDailyApi } from '@/lib/rmhtype/daily.contract';
import { getDaily } from '@/lib/rmhtype/daily.server';

export const route = apiRoute('/api/rmhtype/daily', {
  GET: implement(
    getRmhTypeDailyApi,
    {
      rateLimit: 'read',
    },
    async ({ userId }) => getDaily(userId),
  ),
});
