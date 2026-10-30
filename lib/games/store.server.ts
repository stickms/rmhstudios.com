/** Data for the games Store front and "Players also played". */

import { prisma } from '@/lib/prisma.server';
import { listCuratedBuilds } from '@/lib/builds/curated';
import { getRatingAggs } from '@/lib/games/meta.server';
import { trendingTitles } from '@/lib/games/trending.server';
import {
  MIN_REVIEWS_TO_RANK,
  filterStore,
  rankFeatured,
  tagCounts,
  type StoreItem,
} from '@/lib/games/store';
import type { AlsoPlayed, StoreCard, StoreData } from '@/lib/games/store-types';

export async function getStore(q: { tag?: string; q?: string }): Promise<StoreData> {
  const builds = listCuratedBuilds();
  const items: StoreItem[] = builds.map((b) => ({
    id: b.id,
    title: b.title,
    description: b.description,
    tags: b.tags,
    kind: b.kind,
  }));
  const [trend, ratings] = await Promise.all([
    trendingTitles(),
    getRatingAggs(builds.filter((b) => b.kind === 'game').map((b) => b.id)),
  ]);
  const players = new Map(trend.map((t) => [t.gameId, t.players]));
  const rated = new Map(Object.entries(ratings).filter(([, r]) => r.count > 0));

  const byId = new Map(builds.map((b) => [b.id, b]));
  const card = (it: StoreItem): StoreCard => {
    const b = byId.get(it.id)!;
    const r = rated.get(it.id);
    return {
      id: b.id,
      title: b.title,
      description: b.description,
      tags: b.tags,
      kind: b.kind,
      thumbnailUrl: b.thumbnailUrl,
      bannerUrl: b.bannerUrl,
      hue: b.hue,
      href: b.href,
      players: players.get(b.id) ?? 0,
      rating: r ? { average: r.average, count: r.count } : null,
    };
  };

  const featured = rankFeatured(items, { players, ratings: rated }, 5).map(card);
  const trending = items
    .filter((i) => (players.get(i.id) ?? 0) > 0)
    .sort((a, b) => (trend.findIndex((t) => t.gameId === a.id) - trend.findIndex((t) => t.gameId === b.id)))
    .slice(0, 12)
    .map(card);
  const topRated = items
    .filter((i) => (rated.get(i.id)?.count ?? 0) >= MIN_REVIEWS_TO_RANK)
    .sort((a, b) => (rated.get(b.id)?.average ?? 0) - (rated.get(a.id)?.average ?? 0))
    .slice(0, 12)
    .map(card);
  const searching = !!(q.tag?.trim() || q.q?.trim());

  return {
    featured,
    trending,
    topRated,
    tags: tagCounts(items).slice(0, 30),
    results: searching ? filterStore(items, q).map(card) : null,
    tag: q.tag?.trim() || null,
    q: q.q?.trim() || null,
  };
}

/**
 * Titles that people who play this one also play. Counts only players whose setting is
 * `public`, and returns only totals, so it cannot reveal who played what.
 */
export async function getAlsoPlayed(gameId: string, limit = 6): Promise<AlsoPlayed[]> {
  const fans = await prisma.gamePlaytime.findMany({
    where: { gameId, user: { playtimePrivacy: 'public' } },
    orderBy: { totalSeconds: 'desc' },
    take: 500,
    select: { userId: true },
  });
  if (fans.length === 0) return [];
  const others = await prisma.gamePlaytime.groupBy({
    by: ['gameId'],
    where: { userId: { in: fans.map((f) => f.userId) }, gameId: { not: gameId } },
    _count: { userId: true },
    orderBy: { _count: { userId: 'desc' } },
    take: limit * 2,
  });
  const titles = new Map(listCuratedBuilds().map((b) => [b.id, b]));
  return others.flatMap((o): AlsoPlayed[] => {
    const t = titles.get(o.gameId);
    return t ? [{ id: t.id, title: t.title, thumbnailUrl: t.thumbnailUrl, hue: t.hue, players: o._count.userId }] : [];
  }).slice(0, limit);
}
