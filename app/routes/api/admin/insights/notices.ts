import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { createNoticeSchema } from '@/lib/ops/schema';
import { archiveNotice, createNotice, listNotices } from '@/lib/ops/notices.server';

/**
 * GET    /api/admin/insights/notices — all notices with dismissal counts.
 * POST   /api/admin/insights/notices — publish a segment-targeted notice.
 * DELETE /api/admin/insights/notices — archive one (stops showing; dismissals kept).
 */
export const Route = createFileRoute('/api/admin/insights/notices')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () =>
        Response.json({ notices: await listNotices() }),
      ),
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: createNoticeSchema },
        async ({ userId, body }) => {
          const row = await createNotice(userId, body);
          await logAdminAction(userId, 'notice.create', {
            targetType: 'TargetedNotice',
            targetId: row.id,
            detail: `${body.segment}${body.segmentValue ? `:${body.segmentValue}` : ''}`,
          });
          return Response.json({ id: row.id }, { status: 201 });
        },
      ),
      DELETE: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: z.object({ id: z.string().min(1).max(40) }) },
        async ({ userId, body }) => {
          const ok = await archiveNotice(body.id);
          if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
          await logAdminAction(userId, 'notice.archive', {
            targetType: 'TargetedNotice',
            targetId: body.id,
          });
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
