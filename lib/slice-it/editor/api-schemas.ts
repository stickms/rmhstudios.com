/**
 * Slice It chart editor — the request shapes the chart API accepts.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §11.
 *
 * Client-safe (no server imports) so the editor can validate against exactly the
 * schema the route applies. A chart is user input reaching a `Json` column, so
 * every array here is capped — the note cap is what stops a 40 MB array.
 */

import { z } from 'zod';
import { DIFFICULTIES, MAX_SONG_DURATION_SEC, SLICE_TYPES } from '@/lib/slice-it/constants';

/** Lanes are 0–1 today; G2 (4K/6K) is why the ceiling is 5 rather than 1. */
export const MAX_LANE = 5;

/**
 * 20 notes/second × 900 seconds is the analyser's own note-rate ceiling over the
 * longest permitted track. Anything past it is not a chart.
 */
export const MAX_NOTES_PER_CHART = 18_000;

export const SliceZ = z.object({
  id: z.string().min(1).max(64),
  time: z.number().min(0).max(MAX_SONG_DURATION_SEC),
  type: z.enum(SLICE_TYPES),
  lane: z.number().int().min(0).max(MAX_LANE),
  duration: z.number().min(0).max(60).optional(),
  speedMultiplier: z.number().min(0.1).max(8).optional(),
});

export const TimingPointZ = z.object({
  time: z.number().min(0).max(MAX_SONG_DURATION_SEC),
  bpm: z.number().min(20).max(400),
  meter: z.number().int().min(1).max(16),
});

export const SvPointZ = z.object({
  time: z.number().min(0).max(MAX_SONG_DURATION_SEC),
  multiplier: z.number().min(0.1).max(8),
});

export const RevisionKindZ = z.enum(['autosave', 'manual', 'publish']);

/** `POST /api/slice-it/charts` — seed the four difficulties from `analysisData`. */
export const ChartSeedZ = z.object({
  songId: z.string().min(1).max(64),
  /** 2 today. Present so a 4K seed is a parameter rather than a new endpoint. */
  keys: z.number().int().min(1).max(6).default(2),
});
export type ChartSeedInput = z.infer<typeof ChartSeedZ>;

/** `GET /api/slice-it/charts?songId=…` */
export const ChartListQueryZ = z.object({
  songId: z.string().min(1).max(64),
});

/** `PATCH /api/slice-it/charts/$id` — the autosave payload. */
export const ChartPatchZ = z.object({
  notes: z.array(SliceZ).max(MAX_NOTES_PER_CHART),
  timingPoints: z.array(TimingPointZ).max(2_000).optional(),
  svPoints: z.array(SvPointZ).max(2_000).optional(),
  kind: RevisionKindZ.optional(),
  /** Optional rename — "Expert (Vocal)" for an alternate take. */
  name: z.string().trim().min(1).max(64).optional(),
});
export type ChartPatchInput = z.infer<typeof ChartPatchZ>;

/** What the API returns for one chart. `notes` is present only on the reads. */
export interface ChartDto {
  id: string;
  songId: string;
  authorId: string;
  difficulty: (typeof DIFFICULTIES)[number];
  keys: number;
  name: string;
  status: string;
  rating: number | null;
  isGenerated: boolean;
  generatorVersion: number | null;
  chartHash: string;
  updatedAt: string;
  notes?: z.infer<typeof SliceZ>[];
  timingPoints?: z.infer<typeof TimingPointZ>[] | null;
  svPoints?: z.infer<typeof SvPointZ>[] | null;
}

export interface ChartRevisionDto {
  id: string;
  kind: string;
  label: string | null;
  noteCount: number;
  createdAt: string;
}
