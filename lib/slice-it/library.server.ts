/**
 * Slice It — the library's social and editorial layer.
 *
 * `L2` (curated shelves), `L3` (chart reviews), `L4` (follow an uploader),
 * `L6` (the uploader dashboard), `L9` (reporting and takedowns) and `L12`
 * (storage lifecycle). One module because they are all reads and writes against
 * the same three tables and splitting them would mean six files that each
 * import the other five.
 */

import { apiCache } from '@/lib/cache';
import { prisma } from '@/lib/prisma.server';
import { deleteObject } from '@/lib/storage/s3.server';
import { resolveUser, userDisplaySelect, type ResolvedUser } from '@/lib/user-display';
import { songSelect, toSliceSong } from './songs.server';
import type { SliceSong } from './types';

/* ─── L2 — curated shelves ───────────────────────────────────────────────── */

export type ShelfId = 'featured' | 'hidden-gems' | 'recently-ranked' | 'fresh';

export interface Shelf {
  id: ShelfId;
  songs: SliceSong[];
}

/**
 * 10 minutes.
 *
 * Shelves are editorial, not live. A chart that joins "hidden gems" ten minutes
 * late costs nothing, and the alternative is four aggregate queries on every
 * library open — on the surface most likely to be opened repeatedly.
 */
const SHELF_TTL_MS = 10 * 60 * 1000;

export function invalidateShelves(): void {
  apiCache.invalidatePrefix('slice-it:shelf:');
}

export async function shelf(id: ShelfId, viewerId: string | null): Promise<Shelf> {
  // Keyed by viewer only when there IS one: an anonymous shelf is the same for
  // everyone and caching it per-null-viewer would be one entry, which is the
  // point. A signed-in viewer's rows carry their own lamps, so they cannot
  // share a cache entry — and caching one per user id would blow the cache's
  // 1000-entry ceiling on a busy day, so those are simply not cached.
  const key = `slice-it:shelf:${id}`;
  if (!viewerId) {
    const cached = apiCache.get<Shelf>(key);
    if (cached) return cached;
  }

  const rows = await shelfRows(id);
  const result: Shelf = { id, songs: rows.map((row) => toSliceSong(row, viewerId)) };
  if (!viewerId) apiCache.set(key, result, SHELF_TTL_MS);
  return result;
}

async function shelfRows(id: ShelfId) {
  // `takenDownAt: null` on every shelf. A taken-down song keeps its row so its
  // leaderboard survives (see `takeDownSong`), and an editorial shelf is the
  // last place it should reappear.
  const base = { isPublic: true, takenDownAt: null } as const;

  switch (id) {
    case 'fresh':
      return prisma.song.findMany({
        where: base,
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: songSelect,
      });

    case 'hidden-gems':
      // The play-count CEILING is the whole shelf. Without it this is a second
      // "popular" row: charts people who played them liked, that few played.
      return prisma.song.findMany({
        where: { ...base, plays: { gte: 10, lte: 300 } },
        orderBy: [{ likes: { _count: 'desc' } }, { plays: 'asc' }],
        take: 12,
        select: songSelect,
      });

    case 'recently-ranked': {
      const charts = await prisma.chart.findMany({
        where: { rankStatus: 'ranked' },
        orderBy: { rankStatusAt: 'desc' },
        take: 24,
        select: { songId: true },
      });
      const songIds = [...new Set(charts.map((chart) => chart.songId))].slice(0, 12);
      if (songIds.length === 0) return [];
      return prisma.song.findMany({
        where: { ...base, id: { in: songIds } },
        select: songSelect,
      });
    }

    case 'featured':
    default:
      // "Featured" with no editorial table behind it is the most-played of the
      // last 30 days — which is at least an honest answer to "what are people
      // playing", rather than a hand-curated list nobody maintains.
      return prisma.song.findMany({
        where: { ...base, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
        orderBy: { plays: 'desc' },
        take: 12,
        select: songSelect,
      });
  }
}

/* ─── L3 — chart reviews ─────────────────────────────────────────────────── */

export interface ChartReviewView {
  fit: number;
  fun: number;
  body: string | null;
  createdAt: string;
  user: ResolvedUser;
  isMine: boolean;
}

export interface ChartReviewAgg {
  count: number;
  /** Mean of `fit`, or null below the threshold. */
  fit: number | null;
  fun: number | null;
}

/**
 * Below this many reviews, no average is shown.
 *
 * One 5/5 from the charter's friend is not a rating, and displaying it as
 * "5.0 ★" makes the number worthless everywhere it appears — including in
 * `L2`'s shelves, which read it.
 */
export const MIN_REVIEWS_FOR_AGG = 3;

export async function chartReviews(
  chartId: string,
  viewerId: string | null,
): Promise<{ reviews: ChartReviewView[]; agg: ChartReviewAgg }> {
  const [rows, agg] = await Promise.all([
    prisma.chartReview.findMany({
      where: { chartId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        fit: true,
        fun: true,
        body: true,
        createdAt: true,
        userId: true,
        user: { select: userDisplaySelect },
      },
    }),
    prisma.chartReview.aggregate({
      where: { chartId },
      _count: { _all: true },
      _avg: { fit: true, fun: true },
    }),
  ]);

  const count = agg._count._all;
  return {
    reviews: rows.map((row) => ({
      fit: row.fit,
      fun: row.fun,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      user: resolveUser(row.user),
      isMine: row.userId === viewerId,
    })),
    agg: {
      count,
      fit: count >= MIN_REVIEWS_FOR_AGG ? (agg._avg.fit ?? null) : null,
      fun: count >= MIN_REVIEWS_FOR_AGG ? (agg._avg.fun ?? null) : null,
    },
  };
}

/**
 * Whether this player has cleared this chart.
 *
 * The gate on reviewing. A review from somebody who failed at 0:20 is a review
 * of the first twenty seconds — and the two axes `L3` asks about (does it
 * represent the music, is it fun) are both questions you cannot answer from an
 * intro.
 */
export async function hasClearedChart(chartId: string, userId: string): Promise<boolean> {
  const run = await prisma.sliceRun.findFirst({
    where: { chartId, userId, cleared: true },
    select: { id: true },
  });
  return run !== null;
}

/* ─── L6 — the uploader dashboard ────────────────────────────────────────── */

export interface UploaderDay {
  day: string;
  plays: number;
  avgAccuracy: number;
  clearRate: number;
}

export interface UploaderStats {
  totals: { songs: number; plays: number; likes: number; scores: number };
  /** Per-day telemetry across every chart this uploader owns. */
  timeline: UploaderDay[];
  /** Which difficulty people actually pick. */
  difficultyMix: { difficulty: string; runs: number }[];
  topSongs: { id: string; title: string; plays: number; likes: number }[];
}

export async function uploaderStats(userId: string, days = 90): Promise<UploaderStats> {
  const since = new Date(Date.now() - days * 86_400_000);

  const songs = await prisma.song.findMany({
    where: { uploadedBy: userId },
    select: {
      id: true,
      title: true,
      plays: true,
      _count: { select: { likes: true, scores: true } },
    },
  });
  const songIds = songs.map((song) => song.id);

  // Empty-library short circuit. `IN ()` with no ids is a query Postgres will
  // happily plan and every aggregate below would return a row of nulls that the
  // mapping then has to special-case anyway.
  if (songIds.length === 0) {
    return {
      totals: { songs: 0, plays: 0, likes: 0, scores: 0 },
      timeline: [],
      difficultyMix: [],
      topSongs: [],
    };
  }

  const [runs, byDifficulty] = await Promise.all([
    prisma.sliceRun.findMany({
      where: { songId: { in: songIds }, createdAt: { gte: since } },
      select: { createdAt: true, accuracy: true, cleared: true },
    }),
    prisma.sliceRun.groupBy({
      by: ['difficulty'],
      where: { songId: { in: songIds }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const perDay = new Map<string, { plays: number; accuracy: number; cleared: number }>();
  for (const run of runs) {
    const day = run.createdAt.toISOString().slice(0, 10);
    const entry = perDay.get(day) ?? { plays: 0, accuracy: 0, cleared: 0 };
    entry.plays += 1;
    entry.accuracy += run.accuracy;
    if (run.cleared) entry.cleared += 1;
    perDay.set(day, entry);
  }

  return {
    totals: {
      songs: songs.length,
      plays: songs.reduce((sum, song) => sum + song.plays, 0),
      likes: songs.reduce((sum, song) => sum + song._count.likes, 0),
      scores: songs.reduce((sum, song) => sum + song._count.scores, 0),
    },
    timeline: [...perDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, entry]) => ({
        day,
        plays: entry.plays,
        avgAccuracy: entry.accuracy / entry.plays,
        clearRate: entry.cleared / entry.plays,
      })),
    difficultyMix: byDifficulty
      .map((row) => ({ difficulty: row.difficulty, runs: row._count._all }))
      .sort((a, b) => b.runs - a.runs),
    topSongs: [...songs]
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 10)
      .map((song) => ({
        id: song.id,
        title: song.title,
        plays: song.plays,
        likes: song._count.likes,
      })),
  };
}

/* ─── L9 — takedowns ─────────────────────────────────────────────────────── */

/**
 * Take a song down without destroying anyone's scores.
 *
 * **Tombstone, never delete.** `SongLeaderboard` cascades on song deletion, so
 * removing the row for a DMCA claim silently erases every score anyone ever set
 * on that track — a punishment aimed at one uploader that lands on hundreds of
 * players who did nothing wrong. The row, its charts and every score stay; the
 * audio object goes, because that is the thing the claim is actually about.
 *
 * Returns whether it changed anything, so a double-submitted takedown is a
 * no-op rather than a second storage delete.
 */
export async function takeDownSong(
  songId: string,
  reason: string,
): Promise<{ tookDown: boolean }> {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { id: true, audioUrl: true, takenDownAt: true },
  });
  if (!song || song.takenDownAt !== null) return { tookDown: false };

  await prisma.song.update({
    where: { id: songId },
    data: {
      isPublic: false,
      takenDownAt: new Date(),
      takedownReason: reason.slice(0, 500),
    },
    select: { id: true },
  });

  // After the row, and best-effort. A storage hiccup must not leave the song
  // publicly playable because the delete failed — the row is what serves it.
  await deleteObject(song.audioUrl).catch((error) => {
    console.error('[slice-it] takedown storage delete failed', songId, error);
  });

  invalidateShelves();
  return { tookDown: true };
}

/* ─── L12 — storage lifecycle ────────────────────────────────────────────── */

/**
 * Songs nobody has played in `months`, and whose audio could be archived.
 *
 * Returns candidates and never acts. The audio is the expensive half and the
 * chart is what makes a song a game, so archiving keeps the library entry
 * browsable and the leaderboard intact at the cost of one restore to play —
 * but "nobody played it" is a claim about `SongPlay`, which is only written for
 * signed-in players. Acting on it automatically would archive a song that
 * anonymous visitors play constantly.
 */
export async function archiveCandidates(months = 6, limit = 100) {
  const cutoff = new Date(Date.now() - months * 30 * 86_400_000);
  return prisma.song.findMany({
    where: {
      archivedAt: null,
      takenDownAt: null,
      createdAt: { lt: cutoff },
      songPlays: { none: { lastPlayedAt: { gte: cutoff } } },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true, title: true, audioUrl: true, fileSizeBytes: true, createdAt: true },
  });
}

/** Bytes the archive candidates would free. */
export async function archivableBytes(months = 6): Promise<number> {
  const rows = await archiveCandidates(months, 1000);
  return rows.reduce((sum, row) => sum + (row.fileSizeBytes ?? 0), 0);
}
