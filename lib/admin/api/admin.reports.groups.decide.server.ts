import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { decideReportGroupsApi } from '@/lib/moderation/triage.contract';
import { decideGroupsBody, MAX_DECIDE_REPORTS } from '@/lib/moderation/triage-schema';
import { decideReports, openReportIds } from '@/lib/moderation/triage.server';

/**
 * POST /api/admin/reports/groups/decide — resolve or dismiss every open report of the listed targets. Admin only.
 * Body: { targets: [{ entityType, entityId }] (at most 50), action, deleteContent?, message? }.
 * Takedown and the author message belong to one target: they are refused when more than one is listed.
 */
export const route = apiRoute('/api/admin/reports/groups/decide', {
  POST: implement(
    decideReportGroupsApi,
    {
      auth: 'admin',
      rateLimit: {
        policy: 'write',
        scope: 'user',
      },
      body: decideGroupsBody,
    },
    async ({ session, body }) => {
      if (body.targets.length > 1 && (body.deleteContent || body.message)) {
        return Response.json(
          {
            error: 'Content removal and author messages are for one group at a time',
          },
          {
            status: 400,
          },
        );
      }
      const ids = await openReportIds(body.targets);
      if (ids === null) {
        return Response.json(
          {
            error: `Too many reports: decide at most ${MAX_DECIDE_REPORTS} at a time`,
          },
          {
            status: 400,
          },
        );
      }
      if (ids.length === 0) {
        return Response.json({
          success: true,
          decided: 0,
          skipped: 0,
          takedownFailed: 0,
        });
      }
      const result = await decideReports(ids, {
        action: body.action,
        moderatorId: session.user.id,
        message: body.message,
        deleteContent: body.deleteContent,
      });
      if (result.decided.length === 0 && result.takedownFailed.length > 0) {
        return Response.json(
          {
            error: 'Content takedown failed; the reports were left open',
          },
          {
            status: 500,
          },
        );
      }
      return Response.json({
        success: true,
        decided: result.decided.length,
        skipped: result.skipped.length,
        takedownFailed: result.takedownFailed.length,
      });
    },
  ),
});
