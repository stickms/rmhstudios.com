/**
 * A2 · Why it's trending. Per-tag context from the indexed `post_hashtag`
 * table: when the tag first appeared, the three earliest posts of the current
 * surge, and 24h volume against the previous week's daily average. Cached
 * per tag, so a popular chip costs three indexed reads every ten minutes.
 */
import { prisma } from '@/lib/prisma.server';
import { cached } from '@/lib/cached.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import type { TrendingWhy } from './schema';

export type { TrendingWhy };

const DAY = 86_400_000;
const TTL_MS = 10 * 60_000;

async function compute(tag: string): Promise<TrendingWhy | null> {
  const h = await prisma.hashtag.findUnique({
    where: { tag },
    select: { id: true, createdAt: true },
  });
  if (!h) return null;
  const now = Date.now();
  const d1 = new Date(now - DAY);
  const d8 = new Date(now - 8 * DAY);
  const surgeStart = new Date(Math.max(h.createdAt.getTime(), now - 7 * DAY));
  const [last24h, prevWeek, early] = await Promise.all([
    prisma.postHashtag.count({ where: { hashtagId: h.id, createdAt: { gte: d1 } } }),
    prisma.postHashtag.count({ where: { hashtagId: h.id, createdAt: { gte: d8, lt: d1 } } }),
    prisma.postHashtag.findMany({
      where: { hashtagId: h.id, createdAt: { gte: surgeStart } },
      orderBy: { createdAt: 'asc' },
      take: 12,
      select: { rmheetId: true },
    }),
  ]);
  const posts = early.length
    ? await prisma.rMHark.findMany({
        where: {
          id: { in: early.map((e) => e.rmheetId) },
          deletedAt: null,
          audience: 'PUBLIC',
          communityId: null,
        },
        orderBy: { createdAt: 'asc' },
        take: 3,
        select: {
          id: true,
          content: true,
          createdAt: true,
          user: { select: userDisplaySelect },
        },
      })
    : [];
  const baselinePerDay = Math.round((prevWeek / 7) * 10) / 10;
  return {
    tag,
    firstSeen: h.createdAt.toISOString(),
    last24h,
    baselinePerDay,
    growthPct:
      baselinePerDay > 0 ? Math.round(((last24h - baselinePerDay) / baselinePerDay) * 100) : null,
    starters: posts.map((p) => {
      const u = resolveUser(p.user);
      return {
        id: p.id,
        snippet: p.content.replace(/\s+/g, ' ').trim().slice(0, 140),
        author: u.name ?? u.handle ?? 'Someone',
        href: `/u/${u.handle ?? u.id}/post/${p.id}`,
        createdAt: p.createdAt.toISOString(),
      };
    }),
  };
}

export async function whyTrending(rawTag: string): Promise<TrendingWhy | null> {
  const tag = rawTag.trim().toLowerCase().replace(/^#/, '').slice(0, 50);
  if (!tag) return null;
  return cached<TrendingWhy | null>(`discovery:why:${tag}`, TTL_MS, () => compute(tag));
}
