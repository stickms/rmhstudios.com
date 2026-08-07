/**
 * Slice It — the public hub page's reads (`V12`).
 *
 * `/slice-it` is `authGate: true`, so an anonymous visitor gets a sign-in gate
 * rather than a pitch, and the game has no indexable surface of its own. This
 * module feeds one: what people are actually playing, who is setting records,
 * and who is uploading — all from public rows only.
 *
 * Every query here is **anonymous-safe by construction**: no viewer is passed
 * in, nothing personalises, and `isPublic: false` songs never appear. That is
 * what lets the whole payload be cached and served to a crawler.
 */

import { apiCache } from '@/lib/cache';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser, type ResolvedUser } from '@/lib/user-display';

export interface HubChart {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  duration: number;
  plays: number;
  rating: number | null;
}

export interface HubRecord {
  songId: string;
  title: string;
  artist: string;
  score: number;
  accuracy: number | null;
  difficulty: string;
  user: ResolvedUser;
  at: string;
}

export interface HubCharter {
  user: ResolvedUser;
  uploads: number;
  plays: number;
}

export interface HubPayload {
  topCharts: HubChart[];
  recentRecords: HubRecord[];
  featuredCharters: HubCharter[];
  totals: { songs: number; runs: number };
}

/**
 * 5 minutes.
 *
 * The page is a pitch, not a leaderboard — a record that shows up five minutes
 * late costs nothing, and the alternative is four aggregate queries on every
 * crawl of a page whose entire purpose is to be crawled.
 */
const HUB_TTL_MS = 5 * 60 * 1000;
const HUB_CACHE_KEY = 'slice-it:hub';

export function invalidateSliceItHub(): void {
  apiCache.invalidate(HUB_CACHE_KEY);
}

export async function sliceItHub(): Promise<HubPayload> {
  const cached = apiCache.get<HubPayload>(HUB_CACHE_KEY);
  if (cached) return cached;

  const [topCharts, recentRecords, featuredCharters, songs, runs] = await Promise.all([
    fetchTopCharts(12),
    fetchRecentRecords(10),
    fetchFeaturedCharters(6),
    prisma.song.count({ where: { isPublic: true } }),
    prisma.songLeaderboard.count(),
  ]);

  const payload: HubPayload = {
    topCharts,
    recentRecords,
    featuredCharters,
    totals: { songs, runs },
  };
  apiCache.set(HUB_CACHE_KEY, payload, HUB_TTL_MS);
  return payload;
}

async function fetchTopCharts(take: number): Promise<HubChart[]> {
  const rows = await prisma.song.findMany({
    where: { isPublic: true },
    orderBy: [{ plays: 'desc' }, { createdAt: 'desc' }],
    take,
    select: {
      id: true,
      title: true,
      artist: true,
      coverUrl: true,
      duration: true,
      plays: true,
      chartRating: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    artist: row.artist,
    coverUrl: row.coverUrl,
    duration: row.duration,
    plays: row.plays,
    rating: row.chartRating,
  }));
}

async function fetchRecentRecords(take: number): Promise<HubRecord[]> {
  const rows = await prisma.songLeaderboard.findMany({
    // Public songs only. A personal best on a private upload is not a public
    // record, and surfacing one here would leak both the song and the fact
    // somebody played it.
    where: { song: { isPublic: true } },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      songId: true,
      score: true,
      accuracy: true,
      difficulty: true,
      createdAt: true,
      song: { select: { title: true, artist: true } },
      user: { select: userDisplaySelect },
    },
  });
  return rows.map((row) => ({
    songId: row.songId,
    title: row.song.title,
    artist: row.song.artist,
    score: row.score,
    accuracy: row.accuracy,
    difficulty: row.difficulty,
    user: resolveUser(row.user),
    at: row.createdAt.toISOString(),
  }));
}

/**
 * Uploaders ranked by how much their songs are actually played.
 *
 * By plays rather than by upload count, deliberately: counting uploads rewards
 * bulk, and a hub page that showcases whoever uploaded the most files is an
 * advert for spam.
 */
async function fetchFeaturedCharters(take: number): Promise<HubCharter[]> {
  const grouped = await prisma.song.groupBy({
    by: ['uploadedBy'],
    where: { isPublic: true },
    _count: { _all: true },
    _sum: { plays: true },
    orderBy: { _sum: { plays: 'desc' } },
    take,
  });
  if (grouped.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((row) => row.uploadedBy) } },
    select: userDisplaySelect,
  });
  const byId = new Map(users.map((user) => [user.id, user]));

  return grouped.flatMap((row) => {
    const user = byId.get(row.uploadedBy);
    // A deleted account's uploads stay public but have nobody to credit;
    // dropping the row beats rendering an empty avatar.
    if (!user) return [];
    return [
      {
        user: resolveUser(user),
        uploads: row._count._all,
        plays: row._sum.plays ?? 0,
      },
    ];
  });
}
