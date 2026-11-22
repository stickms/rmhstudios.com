import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getFocusSessionsApi } from '@/lib/rmhstudy/history.contract';
import { sessionsQuery } from '@/lib/rmhstudy/history-schema';
import { listFocusSessions } from '@/lib/rmhstudy/history.server';

/** GET /api/rmhstudy/history/sessions?cursor= — one page of the member's own focus runs. */
export const route = apiRoute('/api/rmhstudy/history/sessions', {
  GET: implement(
    getFocusSessionsApi,
    {
      rateLimit: 'read',
      query: sessionsQuery,
    },
    async ({ userId, query }) => listFocusSessions(userId, query.cursor),
  ),
});
