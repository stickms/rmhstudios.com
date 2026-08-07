/**
 * Slice It — the operations reads and writes (`O1`, `O2`, `O8`).
 *
 * Three questions nothing could answer before: *where* in a chart do players
 * fail, *which* charts generated badly, and *how much* storage is left. All
 * three are computable from data that already exists and is surfaced nowhere;
 * the first signal that the 10 GB cap is close is currently uploads failing.
 *
 * The pure logic lives in `chart-health.ts` so the admin surface, the uploader
 * dashboard and the worker all reach the same verdict. This module is the
 * database and storage half.
 */

import { prisma } from '@/lib/prisma.server';
import { listObjects } from '@/lib/storage/s3.server';
import {
  looksBroken,
  missHeatmap,
  shouldSampleRun,
  spikeBuckets,
  type BrokenVerdict,
  type HeatmapBucket,
  type NoteStat,
} from './chart-health';
import { BEATMAP_VERSION } from './beatmap';
import { SONG_AUDIO_PREFIX, TOTAL_STORAGE_LIMIT_BYTES } from './constants';

/* ─── O1 — recording and reading the heatmap ─────────────────────────────── */

/** One note's outcome in a run. `noteMs` must match the chart's own times. */
export interface NoteOutcome {
  noteMs: number;
  missed: boolean;
}

/**
 * Fold a run's note results into the per-note counters.
 *
 * Sampled: only a tenth of runs are counted, decided from the run id so a
 * retried job makes the same decision and cannot double-count. Returns the
 * number of notes recorded, or 0 when the run was not sampled — the caller logs
 * it rather than assuming the write happened.
 *
 * Fire-and-forget from the score route's point of view. This is telemetry; a
 * failure here must never fail a score submission, and the caller is expected
 * to `.catch()`.
 */
export async function recordNoteStats(input: {
  runId: string | number;
  chartId: string | null;
  chartHash: string | null;
  outcomes: readonly NoteOutcome[];
}): Promise<number> {
  // A run of the generated `Song.analysisData` fallback has no chart identity
  // and no hash, so there is nothing to key a histogram on. Inventing one would
  // be a claim about which notes were played that nothing can support.
  if (!input.chartId || !input.chartHash) return 0;
  if (!shouldSampleRun(input.runId)) return 0;
  if (input.outcomes.length === 0) return 0;

  // Collapsed client-side first: a chart can legitimately have two notes at the
  // same millisecond (one per lane), and issuing two upserts for the same
  // primary key inside one transaction is a self-deadlock waiting to happen.
  const byMs = new Map<number, { attempts: number; misses: number }>();
  for (const outcome of input.outcomes) {
    const ms = Math.round(outcome.noteMs);
    if (!Number.isFinite(ms)) continue;
    const entry = byMs.get(ms) ?? { attempts: 0, misses: 0 };
    entry.attempts += 1;
    if (outcome.missed) entry.misses += 1;
    byMs.set(ms, entry);
  }

  const chartId = input.chartId;
  const chartHash = input.chartHash;
  await prisma.$transaction(
    [...byMs.entries()].map(([noteMs, counts]) =>
      prisma.sliceNoteStat.upsert({
        where: { chartId_chartHash_noteMs: { chartId, chartHash, noteMs } },
        create: { chartId, chartHash, noteMs, attempts: counts.attempts, misses: counts.misses },
        update: {
          attempts: { increment: counts.attempts },
          misses: { increment: counts.misses },
        },
      }),
    ),
  );
  return byMs.size;
}

/** The heatmap for one chart revision, bucketed over its duration. */
export async function chartHeatmap(
  chartId: string,
  chartHash: string,
  durationSec: number,
  buckets = 64,
): Promise<HeatmapBucket[]> {
  const rows = await prisma.sliceNoteStat.findMany({
    where: { chartId, chartHash },
    orderBy: { noteMs: 'asc' },
    select: { noteMs: true, attempts: true, misses: true },
  });
  return missHeatmap(rows as NoteStat[], durationSec, buckets);
}

/* ─── O2 — automatic bad-chart detection ─────────────────────────────────── */

export interface ChartAudit extends BrokenVerdict {
  chartId: string;
  songId: string;
  title: string;
  spikes: number;
}

/**
 * Audit one chart against everything known about how people play it.
 *
 * Reads runs rather than leaderboard rows: `SongLeaderboard` keeps only a
 * player's best, so its accuracy distribution is the distribution of *personal
 * bests*, which is unimodal almost by construction and would hide exactly the
 * two-hump shape this is looking for.
 */
export async function auditChart(chartId: string): Promise<ChartAudit | null> {
  const chart = await prisma.chart.findUnique({
    where: { id: chartId },
    select: {
      id: true,
      songId: true,
      chartHash: true,
      song: { select: { title: true, duration: true } },
    },
  });
  if (!chart) return null;

  const [runs, stats] = await Promise.all([
    prisma.sliceRun.findMany({
      where: { chartId },
      // Bounded. A popular chart has tens of thousands of runs and the
      // distribution's shape is settled long before that; the most recent
      // window is also the one that describes the chart as it is now.
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { accuracy: true, cleared: true },
    }),
    prisma.sliceNoteStat.findMany({
      where: { chartId, chartHash: chart.chartHash },
      select: { noteMs: true, attempts: true, misses: true },
    }),
  ]);

  const accuracies = runs.map((run) => run.accuracy);
  const clearRate = runs.length > 0 ? runs.filter((run) => run.cleared).length / runs.length : 0;
  const spikes = spikeBuckets(
    missHeatmap(stats as NoteStat[], chart.song.duration),
  ).length;

  return {
    ...looksBroken({ accuracies, clearRate, spikes }),
    chartId: chart.id,
    songId: chart.songId,
    title: chart.song.title,
    spikes,
  };
}

/**
 * Every public chart that looks broken.
 *
 * Bounded by `limit` because this is an admin screen, not a job: the sweep that
 * audits the whole library belongs in the worker fleet, and this is the view
 * onto its results.
 */
export async function auditLibrary(limit = 40): Promise<ChartAudit[]> {
  const charts = await prisma.chart.findMany({
    where: { status: { in: ['public', 'ranked'] } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true },
  });
  const audits = await Promise.all(charts.map((chart) => auditChart(chart.id)));
  return audits.filter((audit): audit is ChartAudit => audit !== null && audit.broken);
}

/* ─── O8 — the admin content dashboard ───────────────────────────────────── */

export interface StorageByUploader {
  uploaderId: string;
  songs: number;
  bytes: number;
}

export interface ContentDashboard {
  storage: {
    usedBytes: number;
    limitBytes: number;
    /** 0–1. The number the cap is actually about. */
    headroom: number;
    /** Songs with no recorded size, so `usedBytes` is a floor not a total. */
    unmeasured: number;
  };
  topUploaders: StorageByUploader[];
  /** Songs whose chart predates the current generator. */
  staleCharts: number;
  /** Uploads per day, most recent last. */
  uploadRate: { day: string; count: number }[];
  totals: { songs: number; charts: number; runs: number };
}

export async function contentDashboard(days = 30): Promise<ContentDashboard> {
  const since = new Date(Date.now() - days * 86_400_000);

  const [sizeAgg, unmeasured, byUploader, staleCharts, songs, charts, runs, recent] =
    await Promise.all([
      prisma.song.aggregate({ _sum: { fileSizeBytes: true } }),
      prisma.song.count({ where: { fileSizeBytes: null } }),
      prisma.song.groupBy({
        by: ['uploadedBy'],
        _count: { _all: true },
        _sum: { fileSizeBytes: true },
        orderBy: { _sum: { fileSizeBytes: 'desc' } },
        take: 20,
      }),
      prisma.chart.count({ where: { generatorVersion: { lt: BEATMAP_VERSION } } }),
      prisma.song.count(),
      prisma.chart.count(),
      prisma.sliceRun.count(),
      prisma.song.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
    ]);

  const usedBytes = sizeAgg._sum.fileSizeBytes ?? 0;

  const perDay = new Map<string, number>();
  for (const row of recent) {
    const day = row.createdAt.toISOString().slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }

  return {
    storage: {
      usedBytes,
      limitBytes: TOTAL_STORAGE_LIMIT_BYTES,
      headroom: Math.max(0, 1 - usedBytes / TOTAL_STORAGE_LIMIT_BYTES),
      // Surfaced rather than hidden: rows predating `fileSizeBytes` contribute
      // real bytes to the cap and zero to this total, so "used" is a floor.
      unmeasured,
    },
    topUploaders: byUploader.map((row) => ({
      uploaderId: row.uploadedBy,
      songs: row._count._all,
      bytes: row._sum.fileSizeBytes ?? 0,
    })),
    staleCharts,
    uploadRate: [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({
      day,
      count,
    })),
    totals: { songs, charts, runs },
  };
}

/**
 * Storage objects with no `Song` row pointing at them.
 *
 * Cheap because it never fetches a body: the listing gives keys and the
 * database gives keys, and the answer is a set difference. Pairs with `L12` —
 * you cannot run a lifecycle policy without a view of what it would delete.
 *
 * Returns keys, never deletes. `listObjects` is bounded and may truncate, and
 * a listing can race an in-flight upload — either alone is enough that deleting
 * straight from this result would destroy a song somebody just made. It is a
 * candidate list for a human or a lifecycle policy with its own grace period.
 *
 * `audioUrl` holds the object key for anything uploaded since the storage move.
 * Rows older than that carry a bare filename which is not under this prefix, so
 * they cannot produce a false orphan — their files are not in the listing
 * either.
 */
export async function orphanedObjects(): Promise<string[]> {
  const [keys, rows] = await Promise.all([
    listObjects(SONG_AUDIO_PREFIX),
    prisma.song.findMany({ select: { audioUrl: true } }),
  ]);
  const known = new Set(rows.map((row) => row.audioUrl));
  return keys.filter((key) => !known.has(key));
}
