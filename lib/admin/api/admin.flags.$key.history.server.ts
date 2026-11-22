import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { flagHistoryApi } from '@/lib/flags/targeting.contract';
import { historyQuery } from '@/lib/flags/targeting-schema';
import { flagHistory } from '@/lib/flags/targeting.server';
import { isValidFlagKey } from '@/lib/flags/key';

/** GET /api/admin/flags/$key/history?cursor= — the flag's admin audit entries, newest first, 20 a page (admin only). */
export const route = apiRoute('/api/admin/flags/$key/history', {
  GET: implement(
    flagHistoryApi,
    {
      auth: 'admin',
      rateLimit: 'read',
      query: historyQuery,
    },
    async ({ params, query }) => {
      if (!isValidFlagKey(params.key))
        return Response.json(
          {
            error: 'Not found',
          },
          {
            status: 404,
          },
        );
      return flagHistory(params.key, query.cursor);
    },
  ),
});
