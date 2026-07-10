/**
 * "Your week on RMH" — a personalized weekly recap.
 *
 * Aggregates a user's last-7-day activity and (optionally) generates a short,
 * upbeat narrative via the configured DeepSeek key. Falls back to a templated
 * blurb when the AI isn't configured.
 */

import OpenAI from 'openai';
import { prisma } from '@/lib/prisma.server';
import { getStreak } from '@/lib/streak.server';

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || 'missing',
  baseURL: 'https://api.deepseek.com/v1',
  maxRetries: 1,
});
const MODEL = process.env.RMHARK_AI_MODEL || 'deepseek-chat';

export interface WeeklyRecap {
  rangeStart: string;
  rangeEnd: string;
  posts: number;
  likesReceived: number;
  commentsReceived: number;
  newFollowers: number;
  achievementsUnlocked: number;
  streak: number;
  topPost: { id: string; content: string; likeCount: number } | null;
  blurb: string;
}

export async function generateWeeklyRecap(userId: string): Promise<WeeklyRecap> {
  const now = new Date();
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [posts, likesReceived, commentsReceived, newFollowers, achievements, topPost, streak] =
    await Promise.all([
      prisma.rMHark.count({ where: { userId, deletedAt: null, createdAt: { gte: start } } }),
      prisma.rMHarkLike.count({ where: { rmhark: { userId }, createdAt: { gte: start } } }),
      prisma.rMHarkComment.count({ where: { rmhark: { userId }, createdAt: { gte: start }, NOT: { userId } } }),
      prisma.follow.count({ where: { followingId: userId, createdAt: { gte: start } } }),
      prisma.userAchievement.count({ where: { userId, unlockedAt: { gte: start } } }),
      prisma.rMHark.findFirst({
        where: { userId, deletedAt: null, createdAt: { gte: start } },
        orderBy: { likeCount: 'desc' },
        select: { id: true, content: true, likeCount: true },
      }),
      getStreak(userId),
    ]);

  const stats = {
    posts,
    likesReceived,
    commentsReceived,
    newFollowers,
    achievementsUnlocked: achievements,
    streak: streak.current,
  };

  let blurb = templatedBlurb(stats);
  if (process.env.DEEPSEEK_API_KEY) {
    try {
      const res = await deepseek.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You write short, warm, upbeat weekly recap blurbs (2-3 sentences) for a social/gaming platform called RMH Studios. Use the stats provided. Be encouraging and specific, never generic filler. No emojis-only output; 1-2 emojis max. Do not invent numbers.',
          },
          { role: 'user', content: `Write a recap from these weekly stats: ${JSON.stringify(stats)}` },
        ],
        max_tokens: 160,
        temperature: 0.7,
        stream: false,
      });
      blurb = res.choices[0]?.message?.content?.trim() || blurb;
    } catch {
      // keep templated blurb
    }
  }

  return {
    rangeStart: start.toISOString(),
    rangeEnd: now.toISOString(),
    ...stats,
    topPost: topPost ?? null,
    blurb,
  };
}

function templatedBlurb(s: { posts: number; likesReceived: number; newFollowers: number; streak: number }): string {
  if (s.posts === 0 && s.likesReceived === 0 && s.newFollowers === 0) {
    return 'Quiet week! Drop a post or jump into a game to get things rolling.';
  }
  const bits: string[] = [];
  if (s.posts) bits.push(`${s.posts} post${s.posts === 1 ? '' : 's'}`);
  if (s.likesReceived) bits.push(`${s.likesReceived} like${s.likesReceived === 1 ? '' : 's'}`);
  if (s.newFollowers) bits.push(`${s.newFollowers} new follower${s.newFollowers === 1 ? '' : 's'}`);
  return `Nice week — ${bits.join(', ')}${s.streak ? `, and a ${s.streak}-day streak going` : ''}. Keep it up! 🎉`;
}
