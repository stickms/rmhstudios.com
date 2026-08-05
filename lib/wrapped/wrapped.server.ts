/**
 * Yearly "Wrapped" — a personalized year-in-review (#23). Server-only.
 *
 * Aggregates a user's whole calendar year of activity into a slideshow-ready
 * summary. Separate from the weekly recap (which is kept).
 *
 * **The blurb is read here, never generated here (A9).** This module used to
 * hold its own `OpenAI` client and call DeepSeek inline from
 * `generateYearlyWrapped`, which meant every cold `/wrapped` page view was a
 * model call. That is the wrong shape for this feature specifically: Wrapped
 * traffic is spiky by definition — a launch tweet, a Discord ping, and the whole
 * cohort arrives inside ten minutes — so generating on request schedules the
 * provider rate limit for the exact moment the most people are looking. It also
 * bypassed the metering seam (`lib/ai/provider.server.ts`), so none of that
 * spend appeared in `AiUsage` or counted against anybody's budget.
 *
 * The narrative is now produced ahead of time by the jobs worker
 * (`lib/wrapped/narrative.server.ts`) and cached where both processes can see
 * it. This file does a cache read: a hit renders the written paragraph, a miss
 * renders `templatedBlurb`, and neither path can make a network call. The
 * templated blurb is therefore not a fallback for an outage — it is the normal
 * state of a user whose narrative has not been generated yet, and has to read
 * well on its own.
 */

import { prisma } from '@/lib/prisma.server';
import { levelInfo } from '@/lib/xp/levels';
import { getStreak } from '@/lib/streak.server';
import { readWrappedNarrative } from '@/lib/wrapped/narrative.server';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The numbers, with no prose attached.
 *
 * Split out from `YearlyWrapped` so the narrative job can compute exactly what
 * the page computes without importing the page's rendering concerns — and, more
 * importantly, so there is one definition of "what the model is allowed to
 * know". `WRAPPED_NARRATIVE` forbids inventing an achievement; that promise is
 * only keepable if the serialization the model sees is derived from a fixed,
 * reviewable shape rather than from whatever a caller happened to pass.
 */
export interface WrappedStats {
  posts: number;
  likesReceived: number;
  commentsReceived: number;
  newFollowers: number;
  achievementsUnlocked: number;
  coinsEarned: number;
  level: number;
  longestStreak: number;
  busiestMonth: string | null;
}

export interface YearlyWrapped extends WrappedStats {
  year: number;
  topPost: { id: string; content: string; likeCount: number } | null;
  blurb: string;
  /**
   * Where `blurb` came from. The UI can treat the two differently (an AI
   * paragraph is worth a share button; a templated line is worth less fanfare),
   * and support can tell "the narrative job has not run for this user" apart
   * from "the narrative job produced something bland" without a database query.
   */
  blurbSource: 'ai' | 'template';
}

/**
 * Aggregate one member's year. Pure reads — no model call, no writes.
 *
 * Exported because `generateWrappedNarrative` needs the identical numbers the
 * page will render. Recomputing them there rather than passing them in keeps
 * the job self-contained (it takes a user id, not a payload), and the queries
 * are cheap enough that doing them twice a year per user is not worth a cache.
 */
export async function collectWrappedStats(userId: string, year: number): Promise<WrappedStats> {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const range = { gte: start, lt: end };

  const [
    posts,
    likesReceived,
    commentsReceived,
    newFollowers,
    achievementsUnlocked,
    coinAgg,
    profile,
    streak,
    postDates,
  ] = await Promise.all([
    prisma.rMHark.count({ where: { userId, deletedAt: null, createdAt: range } }),
    prisma.rMHarkLike.count({ where: { rmhark: { userId }, createdAt: range } }),
    prisma.rMHarkComment.count({ where: { rmhark: { userId }, createdAt: range, NOT: { userId } } }),
    prisma.follow.count({ where: { followingId: userId, createdAt: range } }),
    prisma.userAchievement.count({ where: { userId, unlockedAt: range } }),
    prisma.coinTransaction.aggregate({
      where: { recipientId: userId, amount: { gt: 0 }, createdAt: range },
      _sum: { amount: true },
    }),
    prisma.userProfile.findUnique({ where: { userId }, select: { xp: true } }),
    getStreak(userId),
    prisma.rMHark.findMany({
      where: { userId, deletedAt: null, createdAt: range },
      select: { createdAt: true },
    }),
  ]);

  // Busiest month by post count.
  const monthCounts = new Array<number>(12).fill(0);
  for (const p of postDates) monthCounts[p.createdAt.getUTCMonth()]++;
  let busiestMonth: string | null = null;
  let maxMonth = 0;
  for (let i = 0; i < 12; i++) {
    if (monthCounts[i] > maxMonth) {
      maxMonth = monthCounts[i];
      busiestMonth = MONTHS[i];
    }
  }

  return {
    posts,
    likesReceived,
    commentsReceived,
    newFollowers,
    achievementsUnlocked,
    coinsEarned: coinAgg._sum.amount ?? 0,
    level: levelInfo(profile?.xp ?? 0).level,
    longestStreak: streak.longest,
    busiestMonth,
  };
}

/**
 * True when a year has enough in it to be worth narrating.
 *
 * Shared with the narrative job so the two agree about who gets a paragraph:
 * generating "you posted nothing and nobody followed you" costs money to
 * produce a sentence nobody wants to read, and the templated quiet-year line
 * already handles that case with more grace than a model will.
 */
export function hasNarratableYear(stats: WrappedStats): boolean {
  return stats.posts + stats.likesReceived + stats.newFollowers > 0;
}

export async function generateYearlyWrapped(userId: string, year: number): Promise<YearlyWrapped> {
  const range = { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };

  const [stats, topPost] = await Promise.all([
    collectWrappedStats(userId, year),
    prisma.rMHark.findFirst({
      where: { userId, deletedAt: null, createdAt: range },
      orderBy: { likeCount: 'desc' },
      select: { id: true, content: true, likeCount: true },
    }),
  ]);

  // A cache read, deliberately: see the module docblock. `readWrappedNarrative`
  // never generates, so a miss costs a round trip and nothing else.
  const narrative = await readWrappedNarrative(userId, year);

  return {
    year,
    ...stats,
    topPost: topPost ?? null,
    blurb: narrative ?? templatedBlurb(year, stats),
    blurbSource: narrative ? 'ai' : 'template',
  };
}

export function templatedBlurb(
  year: number,
  s: { posts: number; likesReceived: number; newFollowers: number; achievementsUnlocked: number },
): string {
  if (s.posts === 0 && s.likesReceived === 0 && s.newFollowers === 0) {
    return `${year} was a quiet one — here's to a louder year ahead on RMH Studios!`;
  }
  const bits: string[] = [];
  if (s.posts) bits.push(`${s.posts} post${s.posts === 1 ? '' : 's'}`);
  if (s.likesReceived)
    bits.push(`${s.likesReceived} like${s.likesReceived === 1 ? '' : 's'} earned`);
  if (s.newFollowers) bits.push(`${s.newFollowers} new follower${s.newFollowers === 1 ? '' : 's'}`);
  if (s.achievementsUnlocked)
    bits.push(`${s.achievementsUnlocked} achievement${s.achievementsUnlocked === 1 ? '' : 's'}`);
  return `What a year! In ${year} you racked up ${bits.join(', ')}. Thanks for being part of RMH Studios. 🎉`;
}
