/**
 * Yearly "Wrapped" — a personalized year-in-review (#23).
 *
 * Aggregates a user's whole calendar year of activity into a slideshow-ready
 * summary. Separate from the weekly recap (which is kept). An optional AI
 * blurb is generated when DEEPSEEK_API_KEY is set; otherwise a templated one.
 */

import OpenAI from 'openai';
import { prisma } from '@/lib/prisma.server';
import { levelInfo } from '@/lib/xp/levels';
import { getStreak } from '@/lib/streak.server';

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || 'missing',
  baseURL: 'https://api.deepseek.com/v1',
  maxRetries: 1,
});
const MODEL = process.env.RMHARK_AI_MODEL || 'deepseek-chat';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface YearlyWrapped {
  year: number;
  posts: number;
  likesReceived: number;
  commentsReceived: number;
  newFollowers: number;
  achievementsUnlocked: number;
  coinsEarned: number;
  level: number;
  longestStreak: number;
  busiestMonth: string | null;
  topPost: { id: string; content: string; likeCount: number } | null;
  blurb: string;
}

export async function generateYearlyWrapped(userId: string, year: number): Promise<YearlyWrapped> {
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
    topPost,
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
    prisma.rMHark.findFirst({
      where: { userId, deletedAt: null, createdAt: range },
      orderBy: { likeCount: 'desc' },
      select: { id: true, content: true, likeCount: true },
    }),
    prisma.userProfile.findUnique({ where: { userId }, select: { xp: true } }),
    getStreak(userId),
    prisma.rMHark.findMany({
      where: { userId, deletedAt: null, createdAt: range },
      select: { createdAt: true },
    }),
  ]);

  // Busiest month by post count.
  const monthCounts = new Array(12).fill(0);
  for (const p of postDates) monthCounts[p.createdAt.getUTCMonth()]++;
  let busiestMonth: string | null = null;
  let maxMonth = 0;
  for (let i = 0; i < 12; i++) {
    if (monthCounts[i] > maxMonth) {
      maxMonth = monthCounts[i];
      busiestMonth = MONTHS[i];
    }
  }

  const stats = {
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

  let blurb = templatedBlurb(year, stats);
  if (process.env.DEEPSEEK_API_KEY && posts + likesReceived + newFollowers > 0) {
    try {
      const res = await deepseek.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You write a short, celebratory year-in-review blurb (2-3 sentences) for a social/gaming platform called RMH Studios. Use the stats provided, be specific and warm, 1-2 emojis max, never invent numbers.',
          },
          { role: 'user', content: `Write a ${year} Wrapped blurb from these stats: ${JSON.stringify(stats)}` },
        ],
        max_tokens: 160,
        temperature: 0.7,
        stream: false,
      });
      blurb = res.choices[0]?.message?.content?.trim() || blurb;
    } catch {
      // keep templated
    }
  }

  return { year, ...stats, topPost: topPost ?? null, blurb };
}

function templatedBlurb(
  year: number,
  s: { posts: number; likesReceived: number; newFollowers: number; achievementsUnlocked: number }
): string {
  if (s.posts === 0 && s.likesReceived === 0 && s.newFollowers === 0) {
    return `${year} was a quiet one — here's to a louder year ahead on RMH Studios!`;
  }
  const bits: string[] = [];
  if (s.posts) bits.push(`${s.posts} post${s.posts === 1 ? '' : 's'}`);
  if (s.likesReceived) bits.push(`${s.likesReceived} like${s.likesReceived === 1 ? '' : 's'} earned`);
  if (s.newFollowers) bits.push(`${s.newFollowers} new follower${s.newFollowers === 1 ? '' : 's'}`);
  if (s.achievementsUnlocked) bits.push(`${s.achievementsUnlocked} achievement${s.achievementsUnlocked === 1 ? '' : 's'}`);
  return `What a year! In ${year} you racked up ${bits.join(', ')}. Thanks for being part of RMH Studios. 🎉`;
}
