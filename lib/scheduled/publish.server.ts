/**
 * Scheduled-post publisher.
 *
 * Scheduled posts live in `scheduled_post` until their time is due, then are
 * materialized into real RMHarks. There is no background worker, so publishing
 * happens lazily: `publishDueForUser` is called whenever the author touches
 * their drafts list or their own timeline. Already-published rows keep a
 * `publishedId` pointer and are never re-published.
 */

import type { ScheduledPost } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { awardXp } from '@/lib/xp/engine.server';
import { progressQuests } from '@/lib/quests/engine.server';
import { grantAchievement, progressAchievement } from '@/lib/achievements/engine.server';

interface PollPayload {
  question: string;
  options: string[];
  multiSelect?: boolean;
  durationHours?: number;
}

/** Materialize one scheduled post into a real RMHark. Returns the new post id. */
export async function publishScheduledPost(sp: ScheduledPost): Promise<string | null> {
  if (sp.publishedId) return sp.publishedId;

  const poll = (sp.poll as PollPayload | null) ?? null;

  const created = await prisma.$transaction(async (tx) => {
    const post = await tx.rMHark.create({
      data: {
        content: sp.content.trim(),
        gifUrl: sp.gifUrl ?? null,
        imageUrls: sp.imageUrls ?? [],
        userId: sp.userId,
        audience: sp.audience,
        unlockPrice: sp.unlockPrice && sp.unlockPrice > 0 ? sp.unlockPrice : null,
        communityId: sp.communityId ?? null,
      },
      select: { id: true },
    });

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

  // Mirror the compose-path progression/achievements (best-effort).
  try {
    const count = await prisma.rMHark.count({ where: { userId: sp.userId, deletedAt: null } });
    await progressAchievement(sp.userId, 'social.first_post', { setProgress: count });
    await progressAchievement(sp.userId, 'social.posts_10', { setProgress: count });
    await progressAchievement(sp.userId, 'social.posts_100', { setProgress: count });
    if (poll) await grantAchievement(sp.userId, 'social.first_poll');
    if (sp.unlockPrice && sp.unlockPrice > 0) await grantAchievement(sp.userId, 'creator.first_paid_post');
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
