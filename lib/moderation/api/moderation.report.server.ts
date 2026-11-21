import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { notifyAdminsOfReview } from '@/lib/admin-review.server';
import { musicReportOwner } from '@/lib/rmhmusic/learn/moderation.server';
// The reason taxonomy and the length cap live in a client-safe module so the
// report dialog validates against the same declaration this route enforces.
import { reportDetailsWithSnapshot } from '@/lib/competitive/jam-feedback';
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
      case 'stamp': {
        const stamp = await prisma.stamp.findUnique({
          where: { id: entityId },
          select: { creatorId: true },
        });
        return stamp?.creatorId ?? null;
      }
      case 'webring': {
        const ring = await prisma.webring.findUnique({
          where: { id: entityId },
          select: { ownerId: true },
        });
        return ring?.ownerId ?? null;
      }
      case 'ladder-interview': {
        const rep = await prisma.ladderInterviewReport.findUnique({
          where: { id: entityId },
          select: { userId: true },
        });
        return rep?.userId ?? null;
      }
      case 'jam-feedback': {
        // s06-07: the member who wrote the feedback is who a report is about.
        const fb = await prisma.gameJamFeedback.findUnique({
          where: { id: entityId },
          select: { authorId: true },
        });
        return fb?.authorId ?? null;
      }
      case 'build-comment': {
        // s06-14: the member who wrote the comment is who a report is about.
        const bc = await prisma.buildComment.findUnique({
          where: { id: entityId },
          select: { userId: true },
        });
        return bc?.userId ?? null;
      }
      case 'music-score':
      case 'music-share':
        // RMH Music Phase 6: the learner whose Daily score (or shared result) it is.
        return await musicReportOwner(entityType, entityId);
      case 'user':
        return entityId;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export const route = apiRoute('/api/moderation/report', {
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

      // s06-07: feedback is private to the entry's team, so only they (or an admin) may report a piece. This also
      // keeps the report flow from confirming that a feedback id exists, or leaking an anonymous author to anyone.
      if (entityType === 'jam-feedback') {
        const fb = await prisma.gameJamFeedback.findUnique({
          where: { id: entityId },
          select: {
            removedAt: true,
            entry: { select: { userId: true, team: { where: { status: 'accepted' }, select: { userId: true } } } },
          },
        });
        const me = session.user.id;
        const onTeam = !!fb && (fb.entry.userId === me || fb.entry.team.some((m) => m.userId === me));
        const admin = (session.user as { isAdmin?: boolean }).isAdmin === true;
        if (!fb || fb.removedAt || !(onTeam || admin)) {
          return Response.json({ error: 'Feedback not found' }, { status: 404 });
        }
      }

      // s06-14: only a comment the reporter could read can be reported (not a deleted one, not one on a private build
      // they may not see), so the report flow never confirms that a hidden comment exists.
      if (entityType === 'build-comment') {
        const bc = await prisma.buildComment.findUnique({
          where: { id: entityId },
          select: { deletedAt: true, build: { select: { visibility: true, userId: true } } },
        });
        const me = session.user.id;
        const admin = (session.user as { isAdmin?: boolean }).isAdmin === true;
        const readable = !!bc && (bc.build.visibility !== 'PRIVATE' || admin || bc.build.userId === me);
        if (!bc || bc.deletedAt || !readable) {
          return Response.json({ error: 'Comment not found' }, { status: 404 });
        }
      }

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
      // s06-07: a report of jam feedback keeps the reported words (the author may edit them afterwards).
      let storedDetails = details?.trim() || null;
      if (entityType === 'jam-feedback') {
        const fb = await prisma.gameJamFeedback.findUnique({ where: { id: entityId }, select: { body: true } });
        if (fb) storedDetails = reportDetailsWithSnapshot(details, fb.body);
      }

      await prisma.contentReport.create({
        data: {
          reporterId: session.user.id,
          entityType,
          entityId,
          reason,
          details: storedDetails,
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
});
