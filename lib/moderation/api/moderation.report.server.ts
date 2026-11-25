import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { notifyAdminsOfReview } from '@/lib/admin-review.server';
import { notice } from '@/lib/notifications/notice-keys';
import { musicReportOwner } from '@/lib/rmhmusic/learn/moderation.server';
// The reason taxonomy and the length cap live in a client-safe module so the
// report dialog validates against the same declaration this route enforces.
import { reportDetailsWithSnapshot } from '@/lib/competitive/jam-feedback';
import { reportSchema } from '@/lib/moderation/report-schema';
import { issueVisibleTo, issuesReadable } from '@/lib/builds/issues';
import { refusalBody } from '@/lib/errors/codes';
import { MEMBER_ITEM_REPORT_TYPES } from '@/lib/moderation/report-constants';

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
      case 'build-issue': {
        // s10-09: the member who reported the issue is who a report is about.
        const bi = await prisma.buildIssue.findUnique({
          where: { id: entityId },
          select: { reporterId: true },
        });
        return bi?.reporterId ?? null;
      }
      // Sprint 11 (docs/autonomous/sprint-11/plan.md §Anchors)
      // s11-05 lights-out-maker
      case 'lights-out-board':
        // The member who made the board is who a report is about.
        return await (await import('@/lib/lights-out/boards.server')).lightsOutBoardAuthor(entityId);
      // s11-07 studio-share
      case 'studio-share': {
        // The entity id is the share's token; the member who made the share is who a report is about.
        const share = await prisma.studioProjectShare.findUnique({ where: { token: entityId }, select: { userId: true } });
        return share?.userId ?? null;
      }
      // s12-16 member-reports
      case 'connections-grid':
        return await (await import('@/lib/party/connections.server')).gridReportAuthor(entityId);
      case 'study-deck':
        return await (await import('@/lib/study/deck-moderation.server')).deckReportAuthor(entityId);
      case 'persona':
        return await (await import('@/lib/personas/moderation.server')).personaReportAuthor(entityId);
      case 'home-listing':
        // A scraped listing has no member author, so it resolves to null and is not reportable.
        return await (await import('@/lib/homes/listings.server')).listingReportAuthor(entityId);
      // Sprint 13 (docs/autonomous/sprint-13/plan.md §Anchors)
      // s13-06 tube-chat-reports
      case 'tube-chat':
        // The author, with no membership check: the report route itself checks the reporter's.
        return await (await import('@/lib/rmhtube/chat-reports.server')).chatMessageAuthor(entityId);

      // s13-15 rideshare-safety
      case 'ride':
        // The other party depends on who reports, so the report route resolves it (memberItemAuthor below).
        return null;

      // s13-16 pack-reports
      case 'rmhbox-pack':
        return await (await import('@/lib/party/pack-moderation.server')).packReportAuthor(entityId);

      // s13-17 dm-reports
      case 'dm':
        // The sender, with no membership check: the report route itself checks the reporter's.
        return await (await import('@/lib/messages/dm-reports.server')).dmMessageAuthor(entityId);

      // Sprint 14 (docs/autonomous/sprint-14/plan.md §Anchors)
      // s14-07 slice-reports
      case 'song-comment':
        // The comment's author; null for a missing comment or one on a private or taken-down song.
        return await (await import('@features/slice-it/engine/song-reports.server')).songCommentAuthor(entityId);

      // s14-08 game-reports
      case 'game-review':
      case 'game-guide':
      case 'game-thread':
      case 'game-thread-post':
      case 'achievement-tip':
        // The author; null for a missing item, a draft guide and anything a moderator already removed.
        return await (await import('@/lib/games/moderation.server')).gameContentOwner(entityType, entityId);

      // s14-09 profile-reports
      case 'impersonation':
        // The accused account (the entity id). Filed only through `POST /api/handles/impersonation`.
        return entityId;

      // s14-10 tube-room-reports
      case 'tube-room':
        // The room's host; null for a missing or already removed room. Whether the reporter may see the room is
        // checked in the report route (`roomReportable`).
        return await (await import('@/lib/rmhtube/room-reports.server')).roomReportAuthor(entityId);

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

      // s10-09: only an issue the reporter could read can be reported (not a private build's, not one the creator hid
      // from them), so the report flow never confirms that a hidden issue exists.
      if (entityType === 'build-issue') {
        const bi = await prisma.buildIssue.findUnique({
          where: { id: entityId },
          select: { reporterId: true, hiddenAt: true, build: { select: { visibility: true, userId: true } } },
        });
        const me = session.user.id;
        const readable = !!bi && issuesReadable(bi.build.visibility, bi.build.userId === me);
        const seen = !!bi && issueVisibleTo(bi, { userId: me, buildOwnerId: bi.build.userId });
        if (!bi || !readable || !seen) {
          return Response.json({ error: 'Issue not found' }, { status: 404 });
        }
      }

      // s12-16 member-reports: only a public item that has a member author and is not already taken down can be
      // reported, and never one's own. The same answer for a missing item, a private one and a removed one, so the
      // report flow never confirms that one exists.
      let memberItemAuthor: string | null = null;
      if (MEMBER_ITEM_REPORT_TYPES.has(entityType)) {
        const author = await resolveTargetUser(entityType, entityId);
        memberItemAuthor = author;
        if (!author || author === session.user.id) {
          return Response.json(refusalBody(author ? 'FORBIDDEN' : 'NOT_FOUND'), { status: author ? 403 : 404 });
        }
      }

      // Sprint 13 (docs/autonomous/sprint-13/plan.md §Anchors)
      // s13-06 tube-chat-reports
      // s13-06: only a member of the message's room (present or past), and never its author, may report it. Unknown,
      // pruned and never-joined all give the same answer, so message ids cannot be probed.
      if (entityType === 'tube-chat') {
        const author = await (
          await import('@/lib/rmhtube/chat-reports.server')
        ).chatReportAuthor(entityId, session.user.id);
        if (!author) return Response.json(refusalBody('NOT_FOUND'), { status: 404 });
        memberItemAuthor = author;
      }

      // s13-15 rideshare-safety
      // Only the rider or the driver of an accepted trip, up to 30 days after it ended, and about the other party.
      // Unknown, not-yours, never-accepted and too-old all give the same answer, so trip ids cannot be probed.
      if (entityType === 'ride') {
        const author = await (await import('@/lib/rideshare/safety.server')).rideReportAuthor(entityId, session.user.id);
        if (!author) return Response.json(refusalBody('NOT_FOUND'), { status: 404 });
        memberItemAuthor = author;
      }

      // s13-16 pack-reports
      // Only a pack that exists and has not been removed, and never one's own: the same answer for a missing pack and
      // a removed one. The report is filed with the auto-hide count in one transaction, so it does not use the create
      // below.
      if (entityType === 'rmhbox-pack') {
        const author = await resolveTargetUser(entityType, entityId);
        if (!author || author === session.user.id) {
          return Response.json(refusalBody(author ? 'FORBIDDEN' : 'NOT_FOUND'), { status: author ? 403 : 404 });
        }
        const filed = await (
          await import('@/lib/party/pack-moderation.server')
        ).filePackReport({
          reporterId: session.user.id,
          packId: entityId,
          reason,
          details: details?.trim() || null,
        });
        if (!filed.ok) return Response.json(refusalBody('NOT_FOUND'), { status: 404 });
        if (filed.duplicate) return Response.json({ success: true, alreadyReported: true });
        void notifyAdminsOfReview({ notice: notice('admin-review-report', { kind: entityType }), kind: 'reports' });
        return Response.json({ success: true });
      }

      // s13-17 dm-reports
      // Only a member of the message's conversation (direct or group), and never its sender, may report it. Unknown,
      // unsent, expired, a system line and not-yours all give the same answer, so message ids cannot be probed.
      if (entityType === 'dm') {
        const target = await (
          await import('@/lib/messages/dm-reports.server')
        ).dmReportTarget(entityId, session.user.id);
        if (!target.ok) {
          return Response.json(refusalBody(target.reason === 'own' ? 'FORBIDDEN' : 'NOT_FOUND'), {
            status: target.reason === 'own' ? 403 : 404,
          });
        }
        memberItemAuthor = target.authorId;
      }

      // Sprint 14 (docs/autonomous/sprint-14/plan.md §Anchors)
      // s14-07 slice-reports
      // Only a public song that has not been taken down, and never the reporter's own: the same answer for a missing,
      // a private and a removed song. (A comment's visibility rule is in `resolveTargetUser`.)
      if (entityType === 'song') {
        const target = await (await import('@features/slice-it/engine/song-reports.server')).songReportTarget(
          entityId,
          session.user.id,
        );
        if (!target.ok) {
          return Response.json(refusalBody(target.reason === 'own' ? 'FORBIDDEN' : 'NOT_FOUND'), {
            status: target.reason === 'own' ? 403 : 404,
          });
        }
        memberItemAuthor = target.authorId;
      }

      // s14-08 game-reports
      // A review, guide, discussion, reply or tip is eligible through the member-item check above (`resolveTargetUser`
      // answers null for a missing item, a draft guide or a removed item, and the reporter's own is refused there), so
      // nothing more is needed here. A missing, a draft and a removed item all get the same 404, so ids cannot be probed.

      // s14-09 profile-reports
      // An impersonation report carries a structured header naming who is being impersonated, which only
      // `POST /api/handles/impersonation` writes (with its own rate limit and dedupe). The generic route refuses the
      // type before it reads anything, so a report filed here could never be mistaken for evidence.
      if (entityType === 'impersonation') {
        return Response.json(refusalBody('INVALID_INPUT'), { status: 400 });
      }

      // s14-10 tube-room-reports
      // A public room, or one the reporter is in, that is not removed and not their own. A private room they were never
      // in, a removed room and an unknown code all give the same answer, so room codes cannot be probed.
      if (entityType === 'tube-room') {
        const target = await (await import('@/lib/rmhtube/room-reports.server')).roomReportable(
          entityId,
          session.user.id,
        );
        if (!target.ok) {
          return Response.json(refusalBody(target.reason === 'own' ? 'FORBIDDEN' : 'NOT_FOUND'), {
            status: target.reason === 'own' ? 403 : 404,
          });
        }
        memberItemAuthor = target.hostId;
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

      const targetUserId = memberItemAuthor ?? (await resolveTargetUser(entityType, entityId));
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
        notice: notice('admin-review-report', { kind: entityType }),
        kind: 'reports',
      });

      return Response.json({ success: true });
    },
  ),
});
