/**
 * `/api/v1/slice-it/*` and `/api/v1/me/slice-it/runs` (Slice It!; scopes `read:slice-it` and `read:slice-it-runs`).
 *
 * Reads only. A chart's details and a player's public stats answer what the site's own pages show, through an
 * allowlist of fields (the `select`s below): never the chart blob (`analysisData`, a chart's `notes`), never an
 * internal id of another member (a player is addressed and named by handle), never a private or taken-down song.
 * Both public reads filter at the query, not in the mapper.
 *
 * The runs read is the key owner's own `SliceRun` rows, newest first, keyset paged on (`createdAt`, `id`) over the
 * table's `[userId, createdAt desc]` index. `SliceRun.id` is a `BigInt`: it leaves here as a string.
 */
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { leaderboardHiddenUserIds } from '@/lib/game/leaderboard-privacy.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { toModPool } from '@features/slice-it/engine/pools';
import { lampOf } from '@features/slice-it/engine/songs.server';
import type { Lamp } from '@features/slice-it/engine/types';
import { decodeRunCursor, encodeRunCursor, type runsQuery } from '@/lib/api/v1/slice-it-schema';

/**
 * The public reads (charts, a chart, the leaderboard, a player): held by the caller for 30 seconds and never by a
 * shared cache. Not `public`: every call is key-authenticated and counted against that key's quota, which a shared
 * cache would answer around, and a player's answer depends on the key owner (blocks either way are a 404).
 */
export const SLICE_CACHE = { 'Cache-Control': 'private, max-age=30' } as const;
/** The key owner's own runs are personal: never cached. */
export const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

/** A chart is playable by others when it is published; the same filter as the site's player page. */
const PUBLIC_CHART_STATUSES = ['public', 'ranked'];

/** Best rows listed for a player. */
export const BEST_LIMIT = 20;

export const songMetaSelect = {
  id: true,
  title: true,
  artist: true,
  album: true,
  duration: true,
  bpm: true,
  genre: true,
  tags: true,
  chartRating: true,
  plays: true,
  createdAt: true,
  _count: { select: { likes: true, scores: true } },
} satisfies Prisma.SongSelect;

type SongMetaRow = Prisma.SongGetPayload<{ select: typeof songMetaSelect }>;

export interface SliceSongV1 {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  duration: number;
  bpm: number | null;
  genre: string | null;
  tags: string[];
  rating: number | null;
  plays: number;
  likes: number;
  scores: number;
  createdAt: string;
}

/** The fields the charts list has always carried (and the detail repeats). */
export function toSongV1(row: SongMetaRow): SliceSongV1 {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    duration: row.duration,
    bpm: row.bpm,
    genre: row.genre,
    tags: row.tags,
    rating: row.chartRating,
    plays: row.plays,
    likes: row._count.likes,
    scores: row._count.scores,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface SliceChartV1 {
  id: string;
  difficulty: string;
  noteCount: number;
  /** The chart's content hash: it changes when the notes do, so a board can tell an edited chart apart. */
  revision: string;
}

export interface SliceChartDetailV1 extends SliceSongV1 {
  charts: SliceChartV1[];
  reviews: { count: number; fit: number | null; fun: number | null };
}

const round2 = (n: number | null): number | null => (n === null ? null : Math.round(n * 100) / 100);

/**
 * One public song's details. `null` for a song that is private, taken down or missing (the caller answers 404):
 * the three are indistinguishable on purpose.
 */
export async function getChartDetail(songId: string): Promise<SliceChartDetailV1 | null> {
  const song = await prisma.song.findFirst({
    where: { id: songId, isPublic: true, takenDownAt: null },
    select: songMetaSelect,
  });
  if (!song) return null;

  const chartWhere = { songId: song.id, status: { in: PUBLIC_CHART_STATUSES } } satisfies Prisma.ChartWhereInput;
  const [charts, counts, reviews] = await Promise.all([
    prisma.chart.findMany({
      where: chartWhere,
      orderBy: [{ difficulty: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, difficulty: true, chartHash: true },
    }),
    // The note count is the length of the `notes` array. Reading the blob to count it would move hundreds of
    // kilobytes per chart, so Postgres counts it. Table and column names are the schema's (`Chart` has no @@map).
    prisma.$queryRaw<{ id: string; noteCount: number }[]>`
      SELECT "id"::text AS "id",
             CASE WHEN jsonb_typeof("notes") = 'array' THEN jsonb_array_length("notes") ELSE 0 END AS "noteCount"
      FROM "Chart"
      WHERE "songId" = ${song.id} AND "status" IN ('public', 'ranked')`,
    prisma.chartReview.aggregate({
      where: { chart: chartWhere },
      _count: { _all: true },
      _avg: { fit: true, fun: true },
    }),
  ]);
  const noteCounts = new Map(counts.map((c) => [c.id, Number(c.noteCount)]));

  return {
    ...toSongV1(song),
    charts: charts.map((c) => ({
      id: c.id,
      difficulty: c.difficulty,
      noteCount: noteCounts.get(c.id) ?? 0,
      revision: c.chartHash,
    })),
    reviews: { count: reviews._count._all, fit: round2(reviews._avg.fit), fun: round2(reviews._avg.fun) },
  };
}

export interface SlicePlayerBestV1 {
  songId: string;
  title: string;
  artist: string;
  score: number;
  /** `null` on a score set before accuracy was recorded. */
  accuracy: number | null;
  difficulty: string;
  modPool: string;
  lamp: Lamp;
  achievedAt: string;
}

export interface SlicePlayerV1 {
  player: { handle: string; name: string };
  /** `null` for a member who has never submitted a run. */
  career: { totalScore: number; gamesPlayed: number } | null;
  best: SlicePlayerBestV1[];
  uploads: number;
}

/**
 * A member's public Slice It! stats, addressed by handle. `null` (the caller answers 404) for an unknown handle, a
 * member with no handle, a member hidden from boards or banned right now, and a member the viewer and they block
 * either way. Only public, not-taken-down songs are listed or counted.
 */
export async function getPlayer(handle: string, viewerId: string): Promise<SlicePlayerV1 | null> {
  const user = await prisma.user.findUnique({
    where: { handle },
    select: {
      ...userDisplaySelect,
      bannedUntil: true,
      profile: { select: { ...userDisplaySelect.profile.select, hideFromLeaderboards: true } },
    },
  });
  if (!user || !user.handle) return null;
  if (user.bannedUntil && user.bannedUntil.getTime() > Date.now()) return null;
  // The member's own switch, read on their row: the shared hidden set is capped, so it alone could miss them.
  if (user.profile?.hideFromLeaderboards) return null;
  const hidden = await leaderboardHiddenUserIds();
  if (hidden.has(user.id)) return null;

  if (user.id !== viewerId) {
    const block = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: user.id },
          { blockerId: user.id, blockedId: viewerId },
        ],
      },
      select: { id: true },
    });
    if (block) return null;
  }

  const publicSong = { isPublic: true, takenDownAt: null } satisfies Prisma.SongWhereInput;
  const [career, bestRows, uploads] = await Promise.all([
    prisma.player.findUnique({ where: { userId: user.id }, select: { totalScore: true, gamesPlayed: true } }),
    prisma.songLeaderboard.findMany({
      where: { userId: user.id, song: publicSong },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: BEST_LIMIT,
      select: {
        score: true,
        accuracy: true,
        difficulty: true,
        modPool: true,
        cleared: true,
        isFullCombo: true,
        isPerfect: true,
        createdAt: true,
        song: { select: { id: true, title: true, artist: true } },
      },
    }),
    prisma.song.count({ where: { uploadedBy: user.id, ...publicSong } }),
  ]);

  const display = resolveUser(user);
  return {
    player: { handle: user.handle, name: display.name || display.username || user.handle },
    career,
    best: bestRows.map((row) => ({
      songId: row.song.id,
      title: row.song.title,
      artist: row.song.artist,
      score: row.score,
      accuracy: row.accuracy,
      difficulty: row.difficulty,
      modPool: toModPool(row.modPool),
      lamp: lampOf(row),
      achievedAt: row.createdAt.toISOString(),
    })),
    uploads,
  };
}

export interface SliceRunV1 {
  /** The run's id, as a string (it is a 64-bit integer). */
  id: string;
  songId: string;
  chartId: string | null;
  score: number;
  accuracy: number;
  maxCombo: number;
  difficulty: string;
  modPool: string;
  lamp: Lamp;
  cleared: boolean;
  fullCombo: boolean;
  perfect: boolean;
  playedAt: string;
}

export interface SliceRunsPage {
  data: SliceRunV1[];
  nextCursor: string | null;
}

const runSelect = {
  id: true,
  songId: true,
  chartId: true,
  score: true,
  accuracy: true,
  maxCombo: true,
  difficulty: true,
  modPool: true,
  cleared: true,
  isFullCombo: true,
  isPerfect: true,
  createdAt: true,
} satisfies Prisma.SliceRunSelect;

/** The key owner's runs, newest first. `'invalid_cursor'` for a cursor this API did not issue. */
export async function listRunsForKey(
  userId: string,
  q: z.infer<typeof runsQuery>,
): Promise<SliceRunsPage | 'invalid_cursor'> {
  const cur = q.cursor ? decodeRunCursor(q.cursor) : null;
  if (q.cursor && !cur) return 'invalid_cursor';
  const where = {
    userId,
    ...(q.songId ? { songId: q.songId } : {}),
    ...(cur
      ? {
          OR: [{ createdAt: { lt: new Date(cur.ms) } }, { createdAt: new Date(cur.ms), id: { lt: BigInt(cur.id) } }],
        }
      : {}),
  } satisfies Prisma.SliceRunWhereInput;
  const rows = await prisma.sliceRun.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
    select: runSelect,
  });
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return {
    data: page.map((r) => ({
      id: String(r.id),
      songId: r.songId,
      chartId: r.chartId,
      score: r.score,
      accuracy: r.accuracy,
      maxCombo: r.maxCombo,
      difficulty: r.difficulty,
      modPool: r.modPool,
      lamp: lampOf(r),
      cleared: r.cleared,
      fullCombo: r.isFullCombo,
      perfect: r.isPerfect,
      playedAt: r.createdAt.toISOString(),
    })),
    nextCursor:
      rows.length > q.limit && last ? encodeRunCursor({ ms: last.createdAt.getTime(), id: String(last.id) }) : null,
  };
}

/** The query string as a plain object (a repeated parameter keeps its last value). */
export { queryOf, readInput } from './request-input';
