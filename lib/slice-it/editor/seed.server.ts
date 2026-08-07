/**
 * Slice It chart editor — seeding `Chart` rows from `Song.analysisData`.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §0.1 / §16 phase 1.
 *
 * The **hard** constraint this module exists to honour: `Song.analysisData` is
 * read here and never written. It stays exactly what it is — the generated
 * fallback — so a song with no `Chart` row plays today the way it played
 * yesterday, and a regeneration (C8) can overwrite it without asking whether it
 * is about to destroy three hours of someone's work.
 */

import { prisma } from '@/lib/prisma.server';
import { DIFFICULTIES, type Difficulty } from '@/lib/slice-it/constants';
import { resolveSlices } from '@/lib/slice-it/chart';
import type { BeatMap, Slice } from '@/lib/slice-it/types';
import type { ChartDto } from './api-schemas';
import { chartHashOf } from './hash.server';
import { newNoteId, uuidv7 } from './uuid';

/** The display name a seeded chart gets: "Easy", "Normal", … (§1.1 `name`). */
export function defaultChartName(difficulty: Difficulty): string {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}

/** A row as the API hands it back. `notes` is included by the reads only. */
type ChartRow = {
  id: string;
  songId: string;
  authorId: string;
  difficulty: string;
  keys: number;
  name: string;
  status: string;
  rating: number | null;
  isGenerated: boolean;
  generatorVersion: number | null;
  chartHash: string;
  updatedAt: Date;
  notes?: unknown;
  timingPoints?: unknown;
  svPoints?: unknown;
};

export function toChartDto(row: ChartRow, options: { includeNotes?: boolean } = {}): ChartDto {
  return {
    id: row.id,
    songId: row.songId,
    authorId: row.authorId,
    difficulty: row.difficulty as Difficulty,
    keys: row.keys,
    name: row.name,
    status: row.status,
    rating: row.rating,
    isGenerated: row.isGenerated,
    generatorVersion: row.generatorVersion,
    chartHash: row.chartHash,
    updatedAt: row.updatedAt.toISOString(),
    ...(options.includeNotes
      ? {
          notes: (row.notes ?? []) as ChartDto['notes'],
          timingPoints: (row.timingPoints ?? null) as ChartDto['timingPoints'],
          svPoints: (row.svPoints ?? null) as ChartDto['svPoints'],
        }
      : {}),
  };
}

/**
 * The generated note list for one difficulty, ready to store.
 *
 * `resolveSlices` already handles both stored shapes (a flat array from before
 * per-difficulty charts existed, and the record keyed by difficulty). Everything
 * it returns is stripped down to the wire fields — a stored chart must not carry
 * the engine's `hit`/`hitTime` runtime state, which older analyses sometimes did.
 */
export function seedNotesFor(analysis: BeatMap | null, difficulty: Difficulty): Slice[] {
  if (!analysis) return [];
  let slices: Slice[];
  try {
    slices = resolveSlices(analysis, difficulty);
  } catch {
    // A malformed `analysisData` must not stop the editor opening — an empty
    // chart is an honest starting point, a 500 is not.
    return [];
  }
  return slices.map((slice) => ({
    id: slice.id || newNoteId(),
    time: slice.time,
    type: slice.type,
    lane: slice.lane,
    ...(slice.duration != null ? { duration: slice.duration } : {}),
    ...(slice.speedMultiplier != null ? { speedMultiplier: slice.speedMultiplier } : {}),
  }));
}

export interface SeedResult {
  charts: ChartDto[];
  created: number;
}

/**
 * Ensure the caller has a `Chart` row for every difficulty of a song, seeding the
 * missing ones from `analysisData`.
 *
 * Idempotent: called on every editor open, and after the first one it is a single
 * indexed read. Missing rows are inserted with `skipDuplicates`, so two tabs
 * opening the editor at the same moment produce four rows, not eight.
 */
export async function ensureCharts(
  songId: string,
  authorId: string,
  keys: number,
): Promise<SeedResult> {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { id: true, analysisData: true },
  });
  if (!song) throw new Error('Song not found');

  const analysis = (song.analysisData ?? null) as BeatMap | null;
  // `analysisVersion` is stamped by the generator (`beatmap/index.ts`) but is not
  // part of the shared `BeatMap` contract, so it is read structurally rather than
  // asserted onto the type.
  const rawVersion = (analysis as unknown as { analysisVersion?: unknown } | null)?.analysisVersion;
  const generatorVersion = typeof rawVersion === 'number' ? rawVersion : null;

  const existing = await prisma.chart.findMany({
    where: { songId, authorId, keys },
    select: { difficulty: true, name: true },
  });
  const have = new Set(existing.map((row) => `${row.difficulty}:${row.name}`));

  const missing = DIFFICULTIES.filter(
    (difficulty) => !have.has(`${difficulty}:${defaultChartName(difficulty)}`),
  );

  if (missing.length > 0) {
    await prisma.chart.createMany({
      data: missing.map((difficulty) => {
        const notes = seedNotesFor(analysis, difficulty);
        return {
          // Minted here rather than by the column default so the id is
          // time-sortable (UUIDv7) — see `uuid.ts`.
          id: uuidv7(),
          songId,
          authorId,
          difficulty,
          keys,
          name: defaultChartName(difficulty),
          notes: notes as unknown as object,
          chartHash: chartHashOf(notes),
          isGenerated: true,
          generatorVersion,
          status: 'draft',
        };
      }),
      skipDuplicates: true,
    });
  }

  const rows = await prisma.chart.findMany({
    where: { songId, authorId, keys },
    orderBy: { createdAt: 'asc' },
  });

  return {
    charts: rows.map((row) => toChartDto(row as ChartRow, { includeNotes: true })),
    created: missing.length,
  };
}
