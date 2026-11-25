/**
 * Scheduled-post publisher.
 *
 * Scheduled posts live in `scheduled_post` until their time is due, then are
 * materialized into real RMHarks. Publishing happens two ways: lazily, via
 * `publishDueForUser` whenever the author touches their drafts list or their own
 * timeline, and by the `posts.publish-scheduled` job (lib/posts-plus/capsules.server.ts)
 * so a post goes out on time even if its author never comes back (time capsules
 * rely on that). Already-published rows keep a `publishedId` pointer and are
 * never re-published; the row lock in `publishScheduledPost` makes the two paths
 * safe to race.
 */

import { notice } from '@/lib/notifications/notice-keys';
import type { ScheduledPost } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { awardXp } from '@/lib/xp/engine.server';
import { progressQuests } from '@/lib/quests/engine.server';
import { grantAchievement, progressAchievement } from '@/lib/achievements/engine.server';
import { createNotification } from '@/lib/notifications.server';
import { HELD_BY, recordModItem } from '@/lib/communities/automod.server';
import { isRestricted } from '@/lib/moderation/restrictions.server';
import { evaluateScheduledGate, type ScheduledGateOutcome } from '@/lib/scheduled/gate.server';
import { enqueuePostAlert } from '@/lib/communities/post-alerts.server';
import { normalizeGifAlt } from '@/lib/feed/gif-alt';
import { normalizeExplanation, quizAnswerOptionId } from '@/lib/feed/quiz-poll';

interface PollPayload {
  question: string;
  options: string[];
  multiSelect?: boolean;
  ranked?: boolean;
  durationHours?: number;
  /** s07-19: a quiz; the answer is its zero-based position among the options. */
  quiz?: boolean;
  correctIndex?: number;
  explanation?: string;
}

/**
 * One SYSTEM notice per draft per edit: a draft refused, edited and refused again tells the author again, so the
 * dedupe is on the draft id and the notices newer than the draft's `updatedAt`. The drafts page reads the newest one
 * back as the row's reason (`lib/scheduled/list.server.ts`).
 */
async function notifyOnce(
  sp: ScheduledPost,
  entityType: 'scheduled-alt-required' | 'scheduled-refused',
  tail: string,
): Promise<void> {
  const already = await prisma.notification.findFirst({
    where: {
      userId: sp.userId,
      type: 'SYSTEM',
      entityType,
      entityId: sp.id,
      ...(sp.updatedAt ? { createdAt: { gt: sp.updatedAt } } : {}),
    },
    select: { id: true },
  });
  if (already) return;
  const community = sp.communityId
    ? await prisma.community.findUnique({
        where: { id: sp.communityId },
        select: { name: true, slug: true },
      })
    : null;
  await createNotification({
    userId: sp.userId,
    type: 'SYSTEM',
    entityType,
    entityId: sp.id,
    preview:
      entityType === 'scheduled-alt-required'
        ? notice('scheduled-alt-required', { community: community?.name ?? 'a community' })
        : notice('scheduled-refused', { community: community?.name ?? 'a community', reason: tail }),
    link: '/drafts',
  });
}

/** The gate's refusal, told to the author once. */
async function notifyRefusal(sp: ScheduledPost, gate: Extract<ScheduledGateOutcome, { kind: 'refuse' }>): Promise<void> {
  if (gate.notice === 'alt-required') {
    await notifyOnce(sp, 'scheduled-alt-required', 'an image needs a description');
  } else {
    await notifyOnce(sp, 'scheduled-refused', gate.reason.replace(/[.\s]+$/, ''));
  }
}

/** A held scheduled post counts as published: the author hears once, and it is never attempted again. */
async function notifyHeld(sp: ScheduledPost): Promise<void> {
  const community = sp.communityId
    ? await prisma.community.findUnique({ where: { id: sp.communityId }, select: { name: true, slug: true } })
    : null;
  await createNotification({
    userId: sp.userId,
    type: 'SYSTEM',
    entityType: 'scheduled-held',
    entityId: sp.id,
    preview: notice('scheduled-held', { community: community?.name ?? 'a community' }),
    link: community ? `/c/${community.slug}` : '/drafts',
  });
}

/**
 * A refused draft is not gated again on every due pass: AutoMod's "remove" outcome writes the removal log each time it
 * runs. A draft whose refusal notice is newer than its last edit waits this long before the sweep tries it again (a
 * ban or timeout that ended then lets it out); editing the draft (`updatedAt`) or "Post now" decides at once.
 */
export const DUE_REFUSAL_BACKOFF_MS = 15 * 60_000;

/** Drop the drafts the sweep refused and need not look at again yet. One query for the whole batch. */
export async function withoutRecentlyRefused(rows: ScheduledPost[], now: Date = new Date()): Promise<ScheduledPost[]> {
  const candidates = rows.filter((r) => r.communityId);
  if (candidates.length === 0) return rows;
  const notices = await prisma.notification.findMany({
    where: {
      type: 'SYSTEM',
      entityType: { in: ['scheduled-refused', 'scheduled-alt-required'] },
      entityId: { in: candidates.map((r) => r.id) },
      userId: { in: [...new Set(candidates.map((r) => r.userId))] },
      createdAt: { gt: new Date(now.getTime() - DUE_REFUSAL_BACKOFF_MS) },
    },
    select: { entityId: true, userId: true, createdAt: true },
  });
  const waiting = new Set<string>();
  for (const n of notices) {
    const row = candidates.find((r) => r.id === n.entityId && r.userId === n.userId);
    if (row && n.createdAt.getTime() > row.updatedAt.getTime()) waiting.add(row.id);
  }
  return rows.filter((r) => !waiting.has(r.id));
}

/** Materialize one scheduled post into a real RMHark. Returns the new post id. */
export async function publishScheduledPost(sp: ScheduledPost): Promise<string | null> {
  if (sp.publishedId) return sp.publishedId;

  // s09-14: while the author's deletion is scheduled the draft is held, not published (the account is paused; a
  // sign-in that cancels the deletion leaves it a draft for the member to look at).
  const author = await prisma.user.findUnique({ where: { id: sp.userId }, select: { deletionScheduledAt: true } });
  if (author?.deletionScheduledAt) return null;

  // s14-17: a moderator's timeout on posting holds for what the member queued before it. The draft stays a draft and
  // the first pass after the timeout ends publishes it, as a community timeout does below.
  if (await isRestricted(sp.userId, 'post')) return null;

  const poll = (sp.poll as PollPayload | null) ?? null;

  const created = await prisma.$transaction(async (tx) => {
    // Claim the row. The lazy path and the publish job can pick up the same due
    // post at the same moment; whoever takes the lock first publishes, the other
    // sees `publishedId` set once the lock releases and does nothing.
    const claim = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "scheduled_post"
      WHERE "id" = ${sp.id} AND "publishedId" IS NULL FOR UPDATE`;
    if (claim.length === 0) return null;

    // s09-11: the community gate (membership, sanctions, flair, image descriptions, AutoMod), run once per attempt,
    // here under the lock and after the `publishedId` re-check. Allowed publishes, held is stored as a held post,
    // refused leaves the draft (a ban or timeout lifts on its own and the next pass publishes).
    const gate = await evaluateScheduledGate(sp);
    if (gate.kind === 'refuse') return gate;
    const held = gate.kind === 'hold';

    // Uploads made through the developer API (`media_ids`) are `Media` rows that only a post's attachment keeps
    // from the orphan sweep. Claim the author's pending ones for this post; one already attached to another post
    // (two drafts naming the same upload) is not shared: this publish stops cleanly and the row stays a draft.
    const mediaUrls = sp.imageUrls ?? [];
    if (mediaUrls.length > 0) {
      const owned = await tx.media.findMany({
        where: { userId: sp.userId, url: { in: mediaUrls } },
        select: { status: true, postId: true },
      });
      if (owned.some((m) => m.status === 'ATTACHED' && m.postId)) return null;
    }

    const post = await tx.rMHark.create({
      data: {
        content: sp.content.trim(),
        gifUrl: sp.gifUrl ?? null,
        gifAlt: normalizeGifAlt(sp.gifUrl, sp.gifAlt),
        imageUrls: sp.imageUrls ?? [],
        imageAlts: sp.imageAlts ?? [],
        userId: sp.userId,
        audience: sp.audience,
        isSensitive: sp.isSensitive || !!sp.contentWarning,
        contentWarning: sp.contentWarning ?? null,
        replyControl: sp.replyControl,
        unlockPrice: sp.unlockPrice && sp.unlockPrice > 0 ? sp.unlockPrice : null,
        communityId: sp.communityId ?? null,
        // A held post is stored as a live held post is: soft-deleted with the AutoMod marker until a moderator decides.
        ...(held ? { deletedAt: new Date(), deletedBy: HELD_BY } : {}),
      },
      select: { id: true },
    });

    // Keep the denormalized post counters consistent with the compose path
    // (lib/feed/api/rmharks.server.ts): the author's post total and, when the post
    // targets a community, that community's post count. The RMHark.create above
    // succeeds only if the community FK resolves, so the update is safe.
    if (!held) {
      await tx.user.update({
        where: { id: sp.userId },
        data: { postCount: { increment: 1 } },
      });
    }
    if (mediaUrls.length > 0) {
      await tx.media.updateMany({
        where: { userId: sp.userId, url: { in: mediaUrls }, status: 'PENDING' },
        data: { status: 'ATTACHED', postId: post.id, attachedAt: new Date() },
      });
    }
    if (sp.communityId && !held) {
      await tx.community.update({
        where: { id: sp.communityId },
        data: { postCount: { increment: 1 } },
      });
    }

    if (poll && poll.question && Array.isArray(poll.options) && poll.options.length >= 2) {
      const madePoll = await tx.rMHarkPoll.create({
        data: {
          rmheetId: post.id,
          question: poll.question.trim(),
          multiSelect: !!poll.multiSelect,
          ranked: !!poll.ranked,
          closesAt: poll.durationHours
            ? new Date(Date.now() + poll.durationHours * 60 * 60 * 1000)
            : null,
          options: {
            create: poll.options
              .filter((t) => t.trim().length > 0)
              .map((text, i) => ({ text: text.trim(), position: i })),
          },
        },
        include: { options: true },
      });
      // s07-19: a quiz keeps its correct option and explanation (the option ids exist only now).
      if (poll.quiz) {
        await tx.rMHarkPoll.update({
          where: { id: madePoll.id },
          data: {
            correctOptionId: quizAnswerOptionId(madePoll.options, poll.correctIndex),
            explanation: normalizeExplanation(poll.explanation),
          },
        });
      }
    }

    await tx.scheduledPost.update({
      where: { id: sp.id },
      data: { publishedId: post.id },
    });

    return { kind: 'created' as const, id: post.id, held, gate };
  });

  if (created?.kind === 'refuse') {
    await notifyRefusal(sp, created).catch((e) => console.error('[scheduled] refusal notice error:', e));
    return null;
  }

  if (!created) {
    // Lost the race; the winner's id is on the row.
    const row = await prisma.scheduledPost.findUnique({
      where: { id: sp.id },
      select: { publishedId: true },
    });
    return row?.publishedId ?? null;
  }

  // A held or flagged post goes to the mod queue exactly as a live one does (best-effort, like the live path).
  const queueRule = created.gate.kind === 'hold' ? created.gate.holdRule : created.gate.flagRule;
  if (sp.communityId && (created.held || queueRule)) {
    await recordModItem({
      communityId: sp.communityId,
      entityType: 'rmhark',
      entityId: created.id,
      postId: created.id,
      authorId: sp.userId,
      action: created.held ? 'hold' : 'flag',
      ruleName: queueRule ?? 'AutoMod',
      snapshot: sp.content.trim() || '(media post)',
    }).catch((e) => console.error('[scheduled] automod queue error:', e));
  }
  if (created.held) {
    await notifyHeld(sp).catch((e) => console.error('[scheduled] held notice error:', e));
    return created.id;
  }

  // A scheduled community post is visible from now: queue the opted-in members' alerts.
  if (sp.communityId) void enqueuePostAlert(created.id);

  // Z7: tell the author their time capsule has opened (best-effort).
  if (sp.isCapsule) {
    try {
      const author = await prisma.user.findUnique({
        where: { id: sp.userId },
        select: { handle: true },
      });
      await createNotification({
        userId: sp.userId,
        type: 'SYSTEM',
        entityType: 'capsule',
        entityId: created.id,
        preview: notice('time-capsule-opened', {}),
        link: `/u/${author?.handle ?? sp.userId}/post/${created.id}`,
      });
    } catch (e) {
      console.error('[scheduled] capsule notification error:', e);
    }
  }

  // Mirror the compose-path progression/achievements (best-effort).
  try {
    const count = await prisma.rMHark.count({ where: { userId: sp.userId, deletedAt: null } });
    await progressAchievement(sp.userId, 'social.first_post', { setProgress: count });
    await progressAchievement(sp.userId, 'social.posts_10', { setProgress: count });
    await progressAchievement(sp.userId, 'social.posts_100', { setProgress: count });
    if (poll) await grantAchievement(sp.userId, 'social.first_poll');
    if (sp.unlockPrice && sp.unlockPrice > 0)
      await grantAchievement(sp.userId, 'creator.first_paid_post');
    await awardXp(sp.userId, 25);
    await progressQuests(sp.userId, 'post');
  } catch (e) {
    console.error('[scheduled] progression error:', e);
  }

  return created.id;
}

/**
 * Publish every due scheduled post for a user (best-effort). Returns the number
 * published. Safe to call frequently — it only touches rows whose time has come.
 */
export async function publishDueForUser(userId: string): Promise<number> {
  try {
    const due = await prisma.scheduledPost.findMany({
      where: {
        userId,
        publishedId: null,
        scheduledAt: { not: null, lte: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 25,
    });
    let published = 0;
    for (const sp of await withoutRecentlyRefused(due)) {
      const id = await publishScheduledPost(sp).catch((e) => {
        console.error('[scheduled] publish failed:', e);
        return null;
      });
      if (id) published++;
    }
    return published;
  } catch (e) {
    console.error('[scheduled] publishDueForUser error:', e);
    return 0;
  }
}
