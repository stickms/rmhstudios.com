import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { notifyAdminsOfReview } from '@/lib/admin-review.server';
// The reason taxonomy and the length cap live in a client-safe module so the
// report dialog validates against the same declaration this route enforces.
import { reportSchema } from '@/lib/moderation/report-schema';

/**
 * POST /api/moderation/report — file a content report for admin review.
 * Deduplicates: a user can only have one open report per entity.
 */

/** Best-effort lookup of who owns the reported content, for triage. */
async function resolveTargetUser(entityType: string, entityId: string): Promise<string | null> {
  try {
    switch (entityType) {
      case 'rmhark': {
        const r = await prisma.rMHark.findUnique({
          where: { id: entityId },
          select: { userId: true },
        });
        return r?.userId ?? null;
      }
      case 'comment': {
        const c = await prisma.rMHarkComment.findUnique({
          where: { id: entityId },
          select: { userId: true },
        });
        return c?.userId ?? null;
      }
      case 'build': {
        const b = await prisma.userBuild.findUnique({
          where: { id: entityId },
          select: { userId: true },
        });
        return b?.userId ?? null;
      }
      case 'song': {
        // L9 — Slice It uploads. The uploader is the person a claim is about,
        // so triage needs them on the row like every other entity type.
        const song = await prisma.song.findUnique({
          where: { id: entityId },
          select: { uploadedBy: true },
        });
        return song?.uploadedBy ?? null;
      }
      case 'user':
        return entityId;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export const Route = createFileRoute('/api/moderation/report')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: {
            limit: 10,
            windowMs: 60_000,
            prefix: 'moderation-report',
            message: 'Too many reports. Please slow down.',
          },
          body: reportSchema,
          allowEmptyBody: true,
          verboseValidationErrors: true,
        },
        async ({ session, body }) => {
          const { entityType, entityId, reason, details } = body;

          // One open report per (reporter, entity) — silently succeed if it exists.
          const existing = await prisma.contentReport.findFirst({
            where: {
              reporterId: session.user.id,
              entityType,
              entityId,
              status: { in: ['PENDING', 'REVIEWING'] },
            },
            select: { id: true },
          });
          if (existing) {
            return Response.json({ success: true, alreadyReported: true });
          }

          const targetUserId = await resolveTargetUser(entityType, entityId);

          await prisma.contentReport.create({
            data: {
              reporterId: session.user.id,
              entityType,
              entityId,
              reason,
              details: details?.trim() || null,
              targetUserId,
            },
          });

          // Ping admins (grouped, non-blocking) that the moderation queue has
          // something new.
          void notifyAdminsOfReview({
            preview: `New ${entityType} report needs review`,
            kind: 'reports',
          });

          return Response.json({ success: true });
        },
      ),
    },
  },
});
