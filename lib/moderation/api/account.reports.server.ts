/**
 * GET /api/account/reports — the signed-in member's own reports, newest first.
 *
 * Self-only by construction: the reporter id comes from the session, never from the request.
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listMyReportsApi } from '@/lib/moderation/my-reports.contract';
import { myReportsQuery } from '@/lib/moderation/my-reports-schema';
import { listMyReports } from '@/lib/moderation/my-reports.server';

export const route = apiRoute('/api/account/reports', {
  GET: implement(
    listMyReportsApi,
    { rateLimit: { policy: 'read', scope: 'user' }, query: myReportsQuery },
    async ({ session, query }) => {
      const page = await listMyReports(session.user.id, { filter: query.filter, cursor: query.cursor });
      return Response.json(page, { headers: { 'Cache-Control': 'private, no-store' } });
    },
  ),
});
