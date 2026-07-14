import { prisma } from '@/lib/prisma.server';

export interface CreatorAnalytics {
  summary: {
    posts: number;
    impressions: number;
    likes: number;
    comments: number;
    reposts: number;
    /** (likes + comments + reposts) / impressions, as a fraction. */
    engagementRate: number;
  };
  followerCount: number;
  /** Posts published per day over the trailing window (oldest → newest). */
  daily: { date: string; posts: number }[];
  /** The creator's best posts by impressions. */
  topPosts: {
    id: string;
    content: string;
    createdAt: string;
    views: number;
    likes: number;
    comments: number;
    reposts: number;
  }[];
}

const WINDOW_DAYS = 30;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Aggregate a creator's own reach/engagement. Reads the denormalized post
 * counters (cheap) plus the trailing-window post timestamps for a posting-
 * activity series. Own-data only — callers must scope to the session user.
 */
export async function getCreatorAnalytics(userId: string): Promise<CreatorAnalytics> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [agg, user, recent, top] = await Promise.all([
    prisma.rMHark.aggregate({
      where: { userId, deletedAt: null },
      _count: { _all: true },
      _sum: { viewCount: true, likeCount: true, commentCount: true, repostCount: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { followerCount: true } }),
    prisma.rMHark.findMany({
      where: { userId, deletedAt: null, createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    prisma.rMHark.findMany({
      where: { userId, deletedAt: null },
      orderBy: { viewCount: 'desc' },
      take: 5,
      select: {
        id: true,
        content: true,
        createdAt: true,
        viewCount: true,
        likeCount: true,
        commentCount: true,
        repostCount: true,
      },
    }),
  ]);

  const impressions = agg._sum.viewCount ?? 0;
  const likes = agg._sum.likeCount ?? 0;
  const comments = agg._sum.commentCount ?? 0;
  const reposts = agg._sum.repostCount ?? 0;
  const engagementRate = impressions > 0 ? (likes + comments + reposts) / impressions : 0;

  // Build a zero-filled day bucket for the whole window so the chart is stable.
  const buckets = new Map<string, number>();
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    buckets.set(dayKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000)), 0);
  }
  for (const r of recent) {
    const key = dayKey(r.createdAt);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return {
    summary: {
      posts: agg._count._all,
      impressions,
      likes,
      comments,
      reposts,
      engagementRate,
    },
    followerCount: user?.followerCount ?? 0,
    daily: [...buckets.entries()].map(([date, posts]) => ({ date, posts })),
    topPosts: top.map((p) => ({
      id: p.id,
      content: p.content,
      createdAt: p.createdAt.toISOString(),
      views: p.viewCount,
      likes: p.likeCount,
      comments: p.commentCount,
      reposts: p.repostCount,
    })),
  };
}
