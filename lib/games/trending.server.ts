/**
 * What is being played: distinct players and total time per title over the last two
 * weeks. Only players whose setting is `public` count, so a number shown to everyone can
 * never reveal a follower-only or private player.
 */

import { prisma } from '@/lib/prisma.server';

const WINDOW_MS = 14 * 86_400_000;

export type Trend = { gameId: string; players: number; seconds: number };

export async function trendingTitles(now: Date = new Date()): Promise<Trend[]> {
  // One row per player and title (not per day), so "players" is a distinct count.
  const rows = await prisma.gamePlaytimeDay.groupBy({
    by: ['gameId', 'userId'],
    where: { day: { gte: new Date(now.getTime() - WINDOW_MS) }, user: { playtimePrivacy: 'public' } },
    _sum: { seconds: true },
    orderBy: { _sum: { seconds: 'desc' } },
    take: 5000,
  });
  const byGame = new Map<string, Trend>();
  for (const r of rows) {
    const t = byGame.get(r.gameId) ?? { gameId: r.gameId, players: 0, seconds: 0 };
    t.players += 1;
    t.seconds += r._sum.seconds ?? 0;
    byGame.set(r.gameId, t);
  }
  return [...byGame.values()].sort((a, b) => b.seconds - a.seconds || b.players - a.players);
}
