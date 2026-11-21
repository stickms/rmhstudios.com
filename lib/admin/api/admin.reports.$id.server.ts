import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
import { z } from 'zod';
import { decideReports } from '@/lib/moderation/triage.server';

/**
 * POST /api/admin/reports/$id — act on a report. Admin only.
 * Body: { action: 'review' | 'resolve' | 'dismiss', note?, deleteContent? }
 * When deleteContent is true on a rmhark/comment/stamp/webring report, the content is
 * soft-deleted (deletedByAdmin, or removedAt for stamps and rings) as part of resolving.
 */
const actionSchema = z.object({
  action: z.enum(['review', 'resolve', 'dismiss']),
  note: z.string().max(1000).optional(),
  // S4: macro-filled message sent to the reported author as a notification.
  message: z.string().trim().max(1000).optional(),
  deleteContent: z.boolean().optional(),
});

export const route = apiRoute('/api/admin/reports/$id', {
  POST: implement(
    C.actOnAdminReportApi,
    {
      auth: 'admin',
      rateLimit: { policy: 'write', scope: 'user' },
      body: actionSchema,
      allowEmptyBody: true,
    },
    async ({ params, session, body }) => {
      // The decision itself (status check, takedown, compare-and-set, messages, notifications, audit) is
      // `decideReports`, shared with the grouped queue.
      const result = await decideReports([params.id], {
        action: body.action,
        moderatorId: session.user.id,
        note: body.note,
        message: body.message,
        deleteContent: body.deleteContent,
      });
      if (result.missing.length > 0) return Response.json({ error: 'Report not found' }, { status: 404 });
      if (result.takedownFailed.length > 0) {
        return Response.json({ error: 'Content takedown failed; the report was left open' }, { status: 500 });
      }
      const skipped = result.skipped[0];
      if (skipped?.status) {
        return Response.json({ error: `Report is already ${skipped.status.toLowerCase()}` }, { status: 409 });
      }
      if (skipped) return Response.json({ error: 'Report was updated by someone else' }, { status: 409 });
      return Response.json({ success: true, status: result.status });
    },
  ),
});
