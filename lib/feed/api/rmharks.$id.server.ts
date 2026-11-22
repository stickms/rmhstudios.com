import { REMOVED_POST_TEXT } from '@/lib/moderation/removed-text';
import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { feedEventBus } from '@/lib/feed-sse';
import { unlinkPostHashtags } from '@/lib/tags-extract.server';
import { editRMHarkSchema } from '@/lib/rmhark-schema';
import { canViewPost } from '@/lib/feed/audience.server';
import { mapQuotedOriginal } from '@/lib/feed/quoted-original';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { isLocked } from '@/lib/feed/map-feed-item.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { isExpired } from '@/lib/posts-plus/constants';
import { deletePostApi } from '@/lib/feed/rmhark-actions.contract';
import { countsHiddenFrom, redactCounts } from '@/lib/feed/quiet-counts';
import { pollLifecycleView } from '@/lib/feed/poll-lifecycle';
import { getCommunitySettings } from '@/lib/communities/settings.server';
import {
  ALT_REQUIRED_CODE,
  ALT_REQUIRED_MESSAGE,
  clearsDescription,
  communityGifAltMissing,
} from '@/lib/communities/alt-required';
import { resolveEditedGifAlt } from '@/lib/feed/gif-alt';
import { resolveEditedContentWarning } from '@/lib/feed/content-warning';
import { pollOptionCount, rankedPollFields } from '@/lib/feed/ranked-poll';
import { normalizeExplanation, quizRevealFor, viewerHasVoted } from '@/lib/feed/quiz-poll';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { pollLockKey } from '@/lib/feed/poll-lifecycle.server';
import { resolveEndedResult } from '@/lib/feed/ranked-poll.server';

/**
 * Change a quiz's correct option and/or explanation (s07-19). Runs under the poll's advisory lock, the one a vote
 * takes, so a vote cannot land between the check and the write. Returns a refusal Response, or null when applied.
 */
async function editQuizAnswer(
  postId: string,
  correctOptionId: string | undefined,
  explanation: string | null | undefined,
): Promise<Response | null> {
  const found = await prisma.rMHarkPoll.findUnique({
    where: { rmheetId: postId },
    select: { id: true, correctOptionId: true },
  });
  if (!found || !found.correctOptionId) {
    return Response.json({ error: 'This post is not a quiz', code: 'NOT_A_QUIZ' }, { status: 400 });
  }
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, pollLockKey(found.id));
    const poll = await tx.rMHarkPoll.findUnique({
      where: { id: found.id },
      select: { options: { select: { id: true, voteCount: true } } },
    });
    if (!poll) return Response.json({ error: 'Not found' }, { status: 404 });
    const voted =
      poll.options.some((o) => o.voteCount > 0) ||
      !!(await tx.rMHarkPollVote.findFirst({ where: { option: { pollId: found.id } }, select: { id: true } }));
    if (voted) {
      return Response.json(
        { error: 'This quiz has votes, so its answer is locked', code: 'QUIZ_LOCKED' },
        { status: 409 },
      );
    }
    if (correctOptionId !== undefined && !poll.options.some((o) => o.id === correctOptionId)) {
      return Response.json({ error: 'The answer must be one of the options', code: 'BAD_ANSWER' }, { status: 400 });
    }
    await tx.rMHarkPoll.update({
      where: { id: found.id },
      data: {
        ...(correctOptionId !== undefined ? { correctOptionId } : {}),
        ...(explanation !== undefined ? { explanation: normalizeExplanation(explanation) } : {}),
      },
    });
    return null;
  });
}

export const route = apiRoute('/api/rmharks/$id', {
  GET: defineHandler({ auth: 'optional' }, async ({ params, userId }) => {
    const { id } = params;

    const rmhark: any = await prisma.rMHark.findUnique({
      where: { id },
      include: {
        user: { select: userDisplaySelect },
        ...(userId
          ? {
              likes: { where: { userId }, select: { id: true } },
              reposts: { where: { userId }, select: { id: true } },
              unlocks: { where: { userId }, select: { id: true } },
            }
          : {}),
        poll: {
          include: {
            options: {
              orderBy: { position: 'asc' as const },
              include: {
                _count: { select: { votes: true } },
                ...(userId
                  ? { votes: { where: { userId }, select: { id: true, optionId: true, rank: true } } }
                  : {}),
              },
            },
          },
        },
        original: {
          include: {
            user: { select: userDisplaySelect },
            community: { select: { isPrivate: true } },
          },
        },
      },
    });

    if (!rmhark) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // posts-plus X8: a post past its TTL is gone at read time, before the sweep runs.
    if (isExpired(rmhark.expiresAt)) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Audience visibility — non-public posts 404 for viewers who can't see them.
    if (
      !(await canViewPost(
        {
          userId: rmhark.userId,
          audience: rmhark.audience,
          communityId: rmhark.communityId ?? null,
        },
        userId,
      ))
    ) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    let pollData;
    if (rmhark.poll && !rmhark.deletedAt) {
      const poll = rmhark.poll;
      const totalVotes = poll.options.reduce(
        (sum: number, o: any) => sum + pollOptionCount(poll, o),
        0,
      );
      const lifecycle = pollLifecycleView(poll);
      // An ended ranked poll the job has not counted yet is counted now, once, so every reader sees one result.
      const counted = lifecycle.ended ? await resolveEndedResult(poll) : null;
      pollData = {
        id: poll.id,
        question: poll.question,
        multiSelect: poll.multiSelect,
        ...lifecycle,
        ...rankedPollFields(counted ? { ...poll, resultJson: counted } : poll, {
          ended: lifecycle.ended,
          countsHidden: countsHiddenFrom(rmhark.userId, rmhark.user?.profile?.hideCountsOnMine, userId),
        }),
        // s07-19: the quiz answer only for its author, a voter, or anyone once it has ended.
        ...quizRevealFor(
          poll,
          { viewerId: userId, authorId: rmhark.userId },
          viewerHasVoted(poll.options),
        ),
        totalVotes,
        options: poll.options.map((o: any) => ({
          id: o.id,
          text: o.text,
          voteCount: pollOptionCount(poll, o),
        })),
        myVotes: rmhark.poll.options.filter((o: any) => o.votes?.length > 0).map((o: any) => o.id),
      };
    }

    const isDeleted = !!rmhark.deletedAt;
    const deletedMessage = rmhark.deletedByAdmin
      ? REMOVED_POST_TEXT
      : '[This RMHark was deleted by the user]';

    const locked = !isDeleted && isLocked(rmhark, userId);

    // An author who hides their counts shows them to nobody but themselves (lib/feed/quiet-counts).
    return Response.json(redactCounts({
      id: rmhark.id,
      type: 'rmhark',
      createdAt: rmhark.createdAt.toISOString(),
      content: isDeleted ? deletedMessage : locked ? '' : rmhark.content,
      // F23: the detail view needs to know an edit happened to offer the
      // history affordance. Without it the marker seeded from the feed card
      // vanished the moment this response landed.
      edited: !isDeleted && !!rmhark.editedAt,
      user: resolveUser(rmhark.user),
      likeCount: rmhark.likeCount,
      commentCount: rmhark.commentCount,
      repostCount: rmhark.repostCount,
      viewCount: rmhark.viewCount,
      liked: userId ? rmhark.likes.length > 0 : false,
      reposted: userId ? rmhark.reposts.length > 0 : false,
      poll: isDeleted || locked ? undefined : pollData,
      gifUrl: isDeleted || locked ? undefined : (rmhark.gifUrl ?? undefined),
      gifAlt: isDeleted || locked ? undefined : (rmhark.gifAlt ?? undefined),
      isSensitive: isDeleted || locked ? undefined : (rmhark.isSensitive ?? false),
      contentWarning: isDeleted || locked ? undefined : (rmhark.contentWarning ?? undefined),
      imageUrls: isDeleted || locked ? undefined : rmhark.imageUrls,
      imageAlts: isDeleted || locked ? undefined : rmhark.imageAlts,
      isTake: rmhark.isTake || undefined,
      hasNote: rmhark.hasNote || undefined,
      hasEmbed: rmhark.hasEmbed || undefined,
      hasVibe: rmhark.hasVibe || undefined,
      seriesId: rmhark.seriesId ?? undefined,
      expiresAt: rmhark.expiresAt?.toISOString(),
      // The reply the author pinned to the top of the conversation (X: conversation controls).
      pinnedReplyId: rmhark.pinnedCommentId ?? null,
      locked,
      unlockPrice: rmhark.unlockPrice ?? undefined,
      deletedAt: rmhark.deletedAt?.toISOString() || null,
      deletedByAdmin: rmhark.deletedByAdmin,
      // One rule for what a quote card shows (lib/feed/quoted-original.ts).
      original: rmhark.original
        ? mapQuotedOriginal(
            rmhark.original,
            resolveUser(rmhark.original.user),
            userId,
            await getBlockedAuthorIds(userId),
          )
        : undefined,
    }, userId));
  }),
  DELETE: implement(deletePostApi, {}, async ({ params, session }) => {
    const { id } = params;

    const rmhark = await prisma.rMHark.findUnique({
      where: { id },
      select: { userId: true, deletedAt: true, communityId: true },
    });

    if (!rmhark) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const isAdmin = !!(session.user as any).isAdmin;
    if (rmhark.userId !== session.user.id && !isAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const deletedByAdmin = isAdmin && rmhark.userId !== session.user.id;
    const deletedAt = new Date();
    // Only the first delete transitions the post out of the feed; guard the
    // one-shot side effects (hashtag unlink, author post-count decrement) so a
    // re-delete (e.g. admin re-flagging a user-deleted post) can't double-count.
    const firstDelete = !rmhark.deletedAt;

    await prisma.$transaction(async (tx) => {
      await tx.rMHark.update({
        where: { id },
        // An admin's delete is moderation: not restorable by the author from the bin.
        data: { deletedAt, deletedByAdmin, pinnedAt: null, ...(deletedByAdmin ? { deletedBy: 'moderator' } : {}) },
      });
      if (firstDelete) {
        // Drop the post's hashtag links (keeps trending counts accurate).
        await unlinkPostHashtags(tx, id);
        // Decrement the AUTHOR's denormalized post count (never below zero).
        await tx.user.updateMany({
          where: { id: rmhark.userId, postCount: { gt: 0 } },
          data: { postCount: { decrement: 1 } },
        });
        // Decrement the community's denormalized post count (never below zero).
        if (rmhark.communityId) {
          await tx.community.updateMany({
            where: { id: rmhark.communityId, postCount: { gt: 0 } },
            data: { postCount: { decrement: 1 } },
          });
        }
      }
    });

    // Record admin moderation (deleting another user's post).
    if (deletedByAdmin) {
      await logAdminAction(session.user.id, 'rmhark.delete', {
        targetType: 'RMHark',
        targetId: id,
        detail: `author:${rmhark.userId}`,
      });
    }

    // Broadcast deletion via SSE
    const deletedMessage = deletedByAdmin
      ? REMOVED_POST_TEXT
      : '[This RMHark was deleted by the user]';
    feedEventBus.publishPostEngagement(id, {
      type: 'rmhark.deleted',
      rmharkId: id,
      payload: {
        id,
        deletedAt: deletedAt.toISOString(),
        deletedByAdmin,
        content: deletedMessage,
      },
      timestamp: deletedAt.toISOString(),
    });

    return Response.json({ success: true });
  }),
  PATCH: defineHandler({}, async ({ request, params, session }) => {
    const { id } = params;
    const body = await request.json().catch(() => ({}));
    const parsed = editRMHarkSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 },
      );
    }
    const content = parsed.data.content.trim();
    const gifUrlProvided = Object.prototype.hasOwnProperty.call(body, 'gifUrl');
    const gifAltProvided = Object.prototype.hasOwnProperty.call(body, 'gifAlt');
    const nextGifUrl = parsed.data.gifUrl ?? null;

    const existing = await prisma.rMHark.findUnique({
      where: { id },
      select: {
        userId: true,
        content: true,
        deletedAt: true,
        unlockPrice: true,
        gifUrl: true,
        gifAlt: true,
        isSensitive: true,
        contentWarning: true,
        communityId: true,
        imageAlts: true,
      },
    });
    if (!existing || existing.deletedAt) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (existing.userId !== session.user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    // s07-16: an edit never takes an image description away in a community that requires them. The edit body carries
    // no images today, so this only fires if one ever sends `imageAlts` (the stored ones are the baseline).
    if (existing.communityId && Array.isArray((body as { imageAlts?: unknown }).imageAlts)) {
      const community = await getCommunitySettings(existing.communityId);
      const sent = ((body as { imageAlts: unknown[] }).imageAlts as unknown[]).map((a) =>
        typeof a === 'string' ? a : '',
      );
      if (community?.requireImageAlt && clearsDescription(existing.imageAlts, sent)) {
        return Response.json({ error: ALT_REQUIRED_MESSAGE, code: ALT_REQUIRED_CODE }, { status: 400 });
      }
    }
    const existingHasGif = !!existing.gifUrl;
    if (!content && !(gifUrlProvided ? nextGifUrl : existingHasGif)) {
      return Response.json({ error: 'Post cannot be empty' }, { status: 400 });
    }
    // The description follows the GIF: a new GIF starts from the description sent with it, never the old one's.
    const nextGif = resolveEditedGifAlt({
      existingUrl: existing.gifUrl,
      existingAlt: existing.gifAlt,
      nextUrl: gifUrlProvided ? nextGifUrl : undefined,
      nextAlt: gifAltProvided ? (parsed.data.gifAlt ?? null) : undefined,
    });
    // s07-16: a GIF in a requiring community keeps (or arrives with) a description.
    // Only when the GIF or its description changed: an old undescribed GIF does not block editing the text.
    if (existing.communityId && nextGif.gifUrl && (nextGif.gifUrl !== existing.gifUrl || nextGif.gifAlt !== existing.gifAlt)) {
      const community = await getCommunitySettings(existing.communityId);
      if (communityGifAltMissing(community?.requireImageAlt === true, nextGif.gifUrl, nextGif.gifAlt)) {
        return Response.json({ error: ALT_REQUIRED_MESSAGE, code: ALT_REQUIRED_CODE, missingGif: true }, { status: 400 });
      }
    }
    // s07-19: a quiz's answer or explanation can be fixed only while nobody has voted. It runs after every check
    // above, so a refused edit (an empty post, a GIF missing its required description) writes no answer; its own
    // refusals (not a quiz, locked by a vote, not an option) come before anything else is written.
    const quizEdit = parsed.data.quizCorrectOptionId !== undefined || parsed.data.quizExplanation !== undefined;
    if (quizEdit) {
      const locked = await editQuizAnswer(id, parsed.data.quizCorrectOptionId, parsed.data.quizExplanation);
      if (locked) return locked;
    }
    const gifChanged = nextGif.gifUrl !== existing.gifUrl;
    const altChanged = nextGif.gifAlt !== existing.gifAlt;
    // The warning: a reason implies it, `isSensitive: false` clears both. Changing it is a content edit (history row,
    // "edited" marker), because the reason is part of what readers see in the text's place.
    const nextWarning = resolveEditedContentWarning({
      existing: { isSensitive: existing.isSensitive, contentWarning: existing.contentWarning },
      nextSensitive: parsed.data.isSensitive,
      nextReason: parsed.data.contentWarning,
    });
    const warningChanged =
      nextWarning.isSensitive !== existing.isSensitive || nextWarning.contentWarning !== existing.contentWarning;
    if (existing.content === content && !gifChanged && !warningChanged) {
      // A description alone is accessibility metadata, not a content edit: no history row, no "edited" marker.
      if (altChanged) {
        await prisma.rMHark.update({ where: { id }, data: { gifAlt: nextGif.gifAlt } });
      }
      return Response.json({
        success: true,
        content,
        gifUrl: existing.gifUrl ?? undefined,
        gifAlt: nextGif.gifAlt ?? undefined,
        isSensitive: existing.isSensitive,
        contentWarning: existing.contentWarning,
        editedAt: null,
      });
    }

    // Snapshot the previous version, then apply the edit.
    const editedAt = new Date();
    await prisma.$transaction([
      prisma.rMHarkEdit.create({ data: { rmheetId: id, content: existing.content } }),
      prisma.rMHark.update({
        where: { id },
        data: {
          content,
          editedAt,
          ...(gifChanged ? { gifUrl: nextGif.gifUrl } : {}),
          ...(gifChanged || altChanged ? { gifAlt: nextGif.gifAlt } : {}),
          ...(warningChanged ? nextWarning : {}),
        },
      }),
    ]);

    feedEventBus.publishPostEngagement(id, {
      type: 'rmhark.edited',
      rmharkId: id,
      // For paid posts, broadcast the locked teaser (no content) to followers.
      payload:
        existing.unlockPrice && existing.unlockPrice > 0
          ? { id, content: '', locked: true, unlockPrice: existing.unlockPrice, edited: true }
          : {
              id,
              content,
              edited: true,
              isSensitive: nextWarning.isSensitive,
              contentWarning: nextWarning.contentWarning ?? undefined,
            },
      timestamp: editedAt.toISOString(),
    });

    return Response.json({
      success: true,
      content,
      gifUrl: nextGif.gifUrl ?? undefined,
      gifAlt: nextGif.gifAlt ?? undefined,
      isSensitive: nextWarning.isSensitive,
      contentWarning: nextWarning.contentWarning,
      editedAt: editedAt.toISOString(),
    });
  }),
});
