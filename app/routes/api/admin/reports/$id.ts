import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import type { ReportStatus } from '@prisma/client';
import { logAdminAction } from '@/lib/admin-audit.server';
import { takedownStamp } from '@/lib/profile/stamps.server';
import { createNotification } from '@/lib/notifications.server';
import { takedownRing } from '@/lib/profile/webrings.server';

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

const STATUS_BY_ACTION = {
  review: 'REVIEWING',
  resolve: 'RESOLVED',
  dismiss: 'DISMISSED',
} as const;

/**
 * The report lifecycle: PENDING → REVIEWING → RESOLVED | DISMISSED (PENDING may
 * skip straight to either terminal state). RESOLVED and DISMISSED are terminal.
 */
const ALLOWED_FROM: Record<(typeof STATUS_BY_ACTION)[keyof typeof STATUS_BY_ACTION], readonly ReportStatus[]> = {
  REVIEWING: ['PENDING'],
  RESOLVED: ['PENDING', 'REVIEWING'],
  DISMISSED: ['PENDING', 'REVIEWING'],
};

/**
 * Take reported content down. Throws on a real failure so the caller can leave
 * the report open; content that is already gone is not a failure. A post or
 * comment is stamped `deletedBy: 'moderator'` as well as `deletedByAdmin`, so a
 * row the author had already put in the bin stops being restorable from it.
 */
async function takedownReportedContent(entityType: string, entityId: string): Promise<void> {
  const now = new Date();
  if (entityType === 'rmhark') {
    await prisma.$transaction([
      prisma.rMHark.updateMany({
        where: { id: entityId, deletedAt: null },
        data: { deletedAt: now },
      }),
      prisma.rMHark.updateMany({
        where: { id: entityId },
        data: { deletedByAdmin: true, deletedBy: 'moderator' },
      }),
    ]);
  } else if (entityType === 'comment') {
    await prisma.$transaction([
      prisma.rMHarkComment.updateMany({
        where: { id: entityId, deletedAt: null },
        data: { deletedAt: now },
      }),
      prisma.rMHarkComment.updateMany({
        where: { id: entityId },
        data: { deletedByAdmin: true, deletedBy: 'moderator' },
      }),
    ]);
  } else if (entityType === 'stamp') {
    await takedownStamp(entityId);
  } else if (entityType === 'webring') {
    await takedownRing(entityId);
  } else if (entityType === 'ladder-interview') {
    await prisma.ladderInterviewReport.updateMany({
      where: { id: entityId },
      data: { status: 'hidden' },
    });
  }
}

export const Route = createFileRoute('/api/admin/reports/$id')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          auth: 'admin',
          rateLimit: { policy: 'write', scope: 'user' },
          body: actionSchema,
          allowEmptyBody: true,
        },
        async ({ params, session, body }) => {
          const report = await prisma.contentReport.findUnique({ where: { id: params.id } });
          if (!report) return Response.json({ error: 'Report not found' }, { status: 404 });

          const newStatus = STATUS_BY_ACTION[body.action];
          const terminal = newStatus === 'RESOLVED' || newStatus === 'DISMISSED';
          const from = ALLOWED_FROM[newStatus];
          if (!from.includes(report.status)) {
            return Response.json(
              { error: `Report is already ${report.status.toLowerCase()}` },
              { status: 409 },
            );
          }

          // Optionally take the reported content down when resolving. A failed
          // takedown fails the request and leaves the report open: marking it
          // RESOLVED with the content still up would drop it from the queue.
          if (body.deleteContent && body.action === 'resolve') {
            try {
              await takedownReportedContent(report.entityType, report.entityId);
            } catch (e) {
              console.error('Report content takedown failed:', e);
              return Response.json(
                { error: 'Content takedown failed; the report was left open' },
                { status: 500 },
              );
            }
          }

          // CAS on the status we validated: two moderators acting at once (or a
          // stale tab) cannot move a report out of a terminal state.
          const claimed = await prisma.contentReport.updateMany({
            where: { id: params.id, status: { in: [...from] } },
            data: {
              status: newStatus,
              moderatorNote: body.note?.trim() || body.message || report.moderatorNote,
              // REVIEWING is not a resolution: never carry a resolver/time on it.
              resolvedById: terminal ? session.user.id : null,
              resolvedAt: terminal ? new Date() : null,
            },
          });
          if (claimed.count === 0) {
            return Response.json({ error: 'Report was updated by someone else' }, { status: 409 });
          }

          if (body.message && body.action === 'resolve' && report.targetUserId) {
            await createNotification({
              userId: report.targetUserId,
              type: 'SYSTEM',
              entityType: 'report',
              entityId: report.id,
              preview: body.message,
            });
          }

          await logAdminAction(session.user.id, `report.${body.action}`, {
            targetType: report.entityType,
            targetId: report.entityId,
            detail: body.deleteContent ? 'content removed' : undefined,
          });

          return Response.json({ success: true, status: newStatus });
        },
      ),
    },
  },
});
