import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { logAdminAction } from '@/lib/admin-audit.server';

/**
 * POST /api/admin/reports/$id — act on a report. Admin only.
 * Body: { action: 'review' | 'resolve' | 'dismiss', note?, deleteContent? }
 * When deleteContent is true on a rmhark/comment report, the content is
 * soft-deleted (deletedByAdmin) as part of resolving.
 */
const actionSchema = z.object({
  action: z.enum(['review', 'resolve', 'dismiss']),
  note: z.string().max(1000).optional(),
  deleteContent: z.boolean().optional(),
});

const STATUS_BY_ACTION = {
  review: 'REVIEWING',
  resolve: 'RESOLVED',
  dismiss: 'DISMISSED',
} as const;

export const Route = createFileRoute('/api/admin/reports/$id')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }

          const body = await request.json().catch(() => ({}));
          const parsed = actionSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: 'Invalid input' }, { status: 400 });
          }

          const report = await prisma.contentReport.findUnique({ where: { id: params.id } });
          if (!report) return Response.json({ error: 'Report not found' }, { status: 404 });

          const newStatus = STATUS_BY_ACTION[parsed.data.action];
          const terminal = newStatus === 'RESOLVED' || newStatus === 'DISMISSED';

          // Optionally take the reported content down when resolving.
          if (parsed.data.deleteContent && parsed.data.action === 'resolve') {
            try {
              if (report.entityType === 'rmhark') {
                await prisma.rMHark.update({
                  where: { id: report.entityId },
                  data: { deletedAt: new Date(), deletedByAdmin: true },
                });
              } else if (report.entityType === 'comment') {
                await prisma.rMHarkComment.update({
                  where: { id: report.entityId },
                  data: { deletedAt: new Date(), deletedByAdmin: true },
                });
              }
            } catch (e) {
              console.error('Report content takedown failed:', e);
            }
          }

          await prisma.contentReport.update({
            where: { id: params.id },
            data: {
              status: newStatus,
              moderatorNote: parsed.data.note?.trim() || report.moderatorNote,
              resolvedById: terminal ? session.user.id : report.resolvedById,
              resolvedAt: terminal ? new Date() : report.resolvedAt,
            },
          });

          await logAdminAction(session.user.id, `report.${parsed.data.action}`, {
            targetType: report.entityType,
            targetId: report.entityId,
            detail: parsed.data.deleteContent ? 'content removed' : undefined,
          });

          return Response.json({ success: true, status: newStatus });
        } catch (error) {
          console.error('Admin report action error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
