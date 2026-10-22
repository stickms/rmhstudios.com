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

import type { ScheduledPost } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { awardXp } from '@/lib/xp/engine.server';
import { progressQuests } from '@/lib/quests/engine.server';
import { grantAchievement, progressAchievement } from '@/lib/achievements/engine.server';
import { createNotification } from '@/lib/notifications.server';
import { HELD_BY, recordModItem } from '@/lib/communities/automod.server';
import {
  checkScheduledCommunityPost,
  logScheduledRemoval,
  type ScheduledCommunityVerdict,
} from '@/lib/scheduled/community-gate.server';

interface PollPayload {
  question: string;
  options: string[];
  multiSelect?: boolean;
  durationHours?: number;
}

/**
 * A community post that no longer passes the community checks (membership ended,
 * the author was removed, AutoMod/verification rules changed) is NOT published.
 * It is demoted to a plain draft - never left due, or the publish job would
 * re-read the same poison row every run and starve later ones - and the author is
 * told why.
 */
async function refuseCommunityPublish(
  sp: ScheduledPost,
  verdict: RefusedVerdict,
): Promise<void> {
  await prisma.scheduledPost.updateMany({
    where: { id: sp.id, publishedId: null },
    data: { scheduledAt: null, isCapsule: false },
  });
  if (verdict.removedBy && sp.communityId) {
    await logScheduledRemoval(
      { userId: sp.userId, communityId: sp.communityId, content: sp.content },
      verdict.removedBy,
    ).catch(() => {});
  }
  await createNotification({
    userId: sp.userId,
    type: 'SYSTEM',
    entityType: 'scheduled-post',
    entityId: sp.id,
    preview: `Your scheduled community post wasn't published: ${verdict.error}`,
    link: '/drafts',
  }).catch(() => {});
}

/**
 * Materialize one scheduled post into a real RMHark. Returns the new post id, or
 * null when it was not published (lost a race, or refused by the community gate).
 */
export async function publishScheduledPost(sp: ScheduledPost): Promise<string | null> {
  return (await publishScheduledPostDetailed(sp)).postId;
}

export type RefusedVerdict = Extract<ScheduledCommunityVerdict, { ok: false }>;

/** Like {@link publishScheduledPost}, but says why a community post was refused. */
export async function publishScheduledPostDetailed(
  sp: ScheduledPost,
): Promise<{ postId: string | null; refused?: RefusedVerdict }> {
  const out: { refused?: RefusedVerdict } = {};
  const postId = await publishInner(sp, out);
  return { postId, ...out };
}

async function publishInner(
  sp: ScheduledPost,
  out: { refused?: RefusedVerdict },
): Promise<string | null> {
  if (sp.publishedId) return sp.publishedId;

  const poll = (sp.poll as PollPayload | null) ?? null;

  // Re-run the direct path's community checks NOW: membership, verification and
  // AutoMod rules can all have changed since the post was scheduled.
  let held = false;
  let queueRule: string | null = null;
  let queueAction: 'hold' | 'flag' | null = null;
  if (sp.communityId) {
    const verdict = await checkScheduledCommunityPost({
      userId: sp.userId,
      communityId: sp.communityId,
      content: sp.content,
      gifUrl: sp.gifUrl,
      imageUrls: sp.imageUrls,
      hasPoll: !!poll,
    });
    if (!verdict.ok) {
      out.refused = verdict;
      await refuseCommunityPublish(sp, verdict);
      return null;
    }
    held = verdict.held;
    queueRule = verdict.ruleName;
    queueAction = verdict.held ? 'hold' : verdict.flagged ? 'flag' : null;
  }

  const created = await prisma.$transaction(async (tx) => {
    // Claim the row. The lazy path and the publish job can pick up the same due
    // post at the same moment; whoever takes the lock first publishes, the other
    // sees `publishedId` set once the lock releases and does nothing.
    const claim = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "scheduled_post"
      WHERE "id" = ${sp.id} AND "publishedId" IS NULL FOR UPDATE`;
    if (claim.length === 0) return null;

    const post = await tx.rMHark.create({
      data: {
        content: sp.content.trim(),
        gifUrl: sp.gifUrl ?? null,
        imageUrls: sp.imageUrls ?? [],
        imageAlts: sp.imageAlts ?? [],
        userId: sp.userId,
        audience: sp.audience,
        isSensitive: sp.isSensitive,
        replyControl: sp.replyControl,
        unlockPrice: sp.unlockPrice && sp.unlockPrice > 0 ? sp.unlockPrice : null,
        communityId: sp.communityId ?? null,
        // An AutoMod hold is a soft-delete marker: invisible everywhere until a
        // mod approves it (see automod.server.ts resolveModItem).
        ...(held ? { deletedAt: new Date(), deletedBy: HELD_BY } : {}),
      },
      select: { id: true },
    });

    // Keep the denormalized post counters consistent with the compose path
    // (app/routes/api/rmharks.ts): the author's post total and, when the post
    // targets a community, that community's post count. The RMHark.create above
    // succeeds only if the community FK resolves, so the update is safe.
    // A held post is counted when a mod approves it, as on the direct path.
    if (!held) {
      await tx.user.update({
        where: { id: sp.userId },
        data: { postCount: { increment: 1 } },
      });
      if (sp.communityId) {
        await tx.community.update({
          where: { id: sp.communityId },
          data: { postCount: { increment: 1 } },
        });
      }
    }

    if (poll && poll.question && Array.isArray(poll.options) && poll.options.length >= 2) {
      await tx.rMHarkPoll.create({
        data: {
          rmheetId: post.id,
          question: poll.question.trim(),
          multiSelect: !!poll.multiSelect,
          closesAt: poll.durationHours
            ? new Date(Date.now() + poll.durationHours * 60 * 60 * 1000)
            : null,
          options: {
            create: poll.options
              .filter((t) => t.trim().length > 0)
              .map((text, i) => ({ text: text.trim(), position: i })),
          },
        },
      });
    }

    await tx.scheduledPost.update({
      where: { id: sp.id },
      data: { publishedId: post.id },
    });

    return post;
  });

  if (!created) {
    // Lost the race; the winner's id is on the row.
    const row = await prisma.scheduledPost.findUnique({
      where: { id: sp.id },
      select: { publishedId: true },
    });
    return row?.publishedId ?? null;
  }

  // AutoMod hold / flag: file the mod-queue entry (best-effort, as on the direct path).
  if (sp.communityId && queueAction) {
    await recordModItem({
      communityId: sp.communityId,
      entityType: 'rmhark',
      entityId: created.id,
      postId: created.id,
      authorId: sp.userId,
      action: queueAction,
      ruleName: queueRule ?? 'AutoMod',
      snapshot: sp.content.trim() || '(media post)',
    }).catch((e) => console.error('[scheduled] automod queue error:', e));
  }
  // A held post stops here: no capsule notice, progression or XP until approved.
  if (held) return created.id;

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
        preview: 'Your time capsule has opened',
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
    for (const sp of due) {
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
