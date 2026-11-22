/**
 * POST /api/account/reports/$id/withdraw — take back one of your own reports while it is still waiting.
 *
 * A report that is not yours answers 404, exactly like one that does not exist; one a moderator has already picked
 * up answers 409.
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { withdrawReportApi } from '@/lib/moderation/my-reports.contract';
import { withdrawReport } from '@/lib/moderation/my-reports.server';

export const route = apiRoute('/api/account/reports/$id/withdraw', {
  POST: implement(withdrawReportApi, { rateLimit: 'write' }, async ({ session, params }) => {
    const result = await withdrawReport(session.user.id, params.id);
    if (result === 'not_found') return Response.json({ error: 'Report not found' }, { status: 404 });
    if (result === 'not_pending') {
      return Response.json({ error: 'A moderator has already picked this report up' }, { status: 409 });
    }
    return { success: true as const };
  }),
});
