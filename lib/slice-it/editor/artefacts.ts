'use client';

/**
 * Slice It chart editor — the cached analysis artefacts a re-chart runs from.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §8.2.
 *
 * Generation is CPU-bound, but the expensive half — decode → STFT → onsets →
 * tempo → beat track — ran once at upload and its output is persisted on
 * `Song.analysisData`. Re-charting is only the charting pass (selection against
 * a density budget), which is milliseconds. So the editor re-charts **in the
 * browser**, from these artefacts. Re-uploading four minutes of audio to move
 * six notes would be absurd, and a server round trip per slider drag would make
 * the density bias unusable.
 *
 * A full re-analysis (different stem separation, a corrected BPM) is a different
 * operation and still goes server-side — see `O3` in the design doc.
 */

import { quantizeOnsets, type QuantizedNote } from '@/lib/slice-it/beatmap/charter';
import type { AnalysisArtefacts, StoredOnset } from '@/lib/slice-it/beatmap';
import { decodeEnvelope, ENVELOPE_RATE } from '@/lib/slice-it/beatmap/envelope';
import type { Section } from '@/lib/slice-it/beatmap/sections';
import type { Onset } from '@/lib/slice-it/beatmap/onsets';
import { syntheticBeats } from '@/lib/slice-it/beatmap/tempo';
import type { BeatMap, Difficulty, Slice } from '@/lib/slice-it/types';

/**
 * A detected onset the editor can draw and promote (§6).
 *
 * `kept: false` is the interesting case — the generator considered this moment
 * and rejected it, and clicking its ghost is the single most-used interaction
 * in the editor. Only present for songs analysed by a generator that persists
 * artefacts; there is no way to recover them for an older song short of a
 * re-analysis, because the spectrogram they came from is long gone.
 */
export interface GhostOnset {
  time: number;
  strength: number;
  /** The lane the charter's own frequency-band rule would have put it on. */
  lane: number;
  kept: boolean;
}

/**
 * The charter's lane rule, applied to a stored onset.
 *
 * Duplicated thresholds, knowingly: `LOW_LANE_BIAS` / `HIGH_LANE_BIAS` are
 * private to `charter.ts`, which another agent owns this wave, so exporting
 * them is a cross-boundary change recorded in
 * `docs/_handoff/editor-phase678-requests.md`. The values are copied exactly
 * and the *only* consequence of drift is that a promoted ghost lands on the
 * lane the generator would not have chosen — visible, and one drag to fix,
 * rather than silent.
 *
 * The charter's later passes (anti-jack alternation, same-lane spacing) are
 * deliberately NOT reproduced: they are properties of a whole chart being
 * generated, and a single promoted note has no run to alternate against.
 */
const LOW_LANE_BIAS = 0.42;
const HIGH_LANE_BIAS = 0.3;

export function suggestLane(onset: { l: number; h: number }, keys = 2): number {
  if (onset.l >= LOW_LANE_BIAS) return 0;
  if (onset.h >= HIGH_LANE_BIAS) return Math.min(1, keys - 1);
  // Mid-range: the charter alternates here. With no run to alternate against,
  // the deterministic answer is the lower lane — an author moves it in one drag
  // and, unlike a random choice, it does not move when they undo and redo.
  return 0;
}

export interface EditorArtefacts {
  songId: string;
  duration: number;
  /** Beat times, seconds. The grid every regenerated note quantises to. */
  beats: number[];
  /** The candidate pool the charter selects from, densest tier first. */
  pool: QuantizedNote[];
  /** Peak envelope bytes (0–255) and their rate — empty when not stored (§6). */
  envelope: { bytes: Uint8Array; rate: number };
  /** Every detected onset, kept and rejected, in time order. */
  ghosts: GhostOnset[];
  /** Structure (C5). Empty when the song predates artefact persistence. */
  sections: Section[];
  /**
   * Where the pool came from, so the panel can be honest about it.
   *
   * `'analysis'` is the stored analyser output. `'chart'` is the fallback for a
   * song uploaded before analysis was persisted: the densest existing chart
   * stands in for the onset list, which regenerates a plausible chart from what
   * the generator already chose but cannot recover onsets it rejected.
   */
  source: 'analysis' | 'chart';
}

/** Stored analysis carries more than the `BeatMap` type admits — see `beatmap/index.ts`. */
interface StoredAnalysis extends BeatMap {
  beats?: number[];
  analysisVersion?: number;
  artefacts?: AnalysisArtefacts;
}

interface SongResponse {
  id: string;
  duration?: number;
  bpm?: number;
  analysisData?: StoredAnalysis | null;
}

/**
 * One fetch per song per session.
 *
 * The analysis blob is hundreds of KB and never changes without a re-analysis,
 * so the panel reads it once and every subsequent scope/density change re-charts
 * from memory. This is what makes Preview feel like a slider rather than a job.
 */
const cache = new Map<string, EditorArtefacts>();

export function cachedArtefacts(songId: string): EditorArtefacts | null {
  return cache.get(songId) ?? null;
}

export function primeArtefacts(artefacts: EditorArtefacts): void {
  cache.set(artefacts.songId, artefacts);
}

/** Test seam and reload path — drop a song's cached analysis. */
export function clearArtefacts(songId?: string): void {
  if (songId) cache.delete(songId);
  else cache.clear();
}

export interface LoadArtefactsInput {
  songId: string;
  duration: number;
  bpm: number;
  /** The densest chart currently open, for the no-stored-analysis fallback. */
  fallbackSlices: readonly Slice[];
}

export async function loadArtefacts(input: LoadArtefactsInput): Promise<EditorArtefacts> {
  const hit = cache.get(input.songId);
  if (hit) return hit;

  let analysis: StoredAnalysis | null = null;
  try {
    const response = await fetch(`/api/slice-it/songs/${encodeURIComponent(input.songId)}`, {
      headers: { accept: 'application/json' },
    });
    if (response.ok) {
      const body = (await response.json()) as SongResponse;
      analysis = body.analysisData ?? null;
    }
  } catch {
    // Offline, or the song read failed: the chart fallback below still produces
    // a usable pool, and a regenerate the author can preview is worth more than
    // an error toast.
    analysis = null;
  }

  const artefacts = buildArtefacts(input, analysis);
  cache.set(input.songId, artefacts);
  return artefacts;
}

/** Pure half of {@link loadArtefacts} — the part with the interesting decisions. */
export function buildArtefacts(
  input: LoadArtefactsInput,
  analysis: StoredAnalysis | null,
): EditorArtefacts {
  const beats =
    analysis?.beats && analysis.beats.length >= 4
      ? analysis.beats.slice()
      : syntheticBeats(input.duration, input.bpm > 0 ? input.bpm : 120);

  const stored = analysis ? densestSlices(analysis) : [];
  const source: 'analysis' | 'chart' = stored.length > 0 ? 'analysis' : 'chart';
  const slices = stored.length > 0 ? stored : input.fallbackSlices;

  const artefacts = analysis?.artefacts ?? null;
  const rawOnsets: StoredOnset[] = Array.isArray(artefacts?.onsets) ? artefacts.onsets : [];

  return {
    songId: input.songId,
    duration: input.duration,
    beats,
    pool: poolFromSlices(slices, beats),
    envelope: {
      bytes: decodeEnvelope(artefacts?.envelope),
      rate: artefacts?.envelope?.rate ?? ENVELOPE_RATE,
    },
    ghosts: rawOnsets
      .filter((onset) => Number.isFinite(onset?.t))
      .map((onset) => ({
        time: onset.t,
        strength: Number.isFinite(onset.s) ? onset.s : 0.5,
        lane: suggestLane({ l: onset.l ?? 0, h: onset.h ?? 0 }),
        kept: Boolean(onset.k),
      }))
      .sort((a, b) => a.time - b.time),
    sections: Array.isArray(artefacts?.sections) ? artefacts.sections : [],
    source,
  };
}

/**
 * The densest tier of a stored analysis.
 *
 * Expert, when the blob has per-difficulty charts, because the charter derives
 * each tier from the one above it — Easy ⊆ Normal ⊆ Hard ⊆ Expert — so Expert is
 * the closest thing to the original onset pool that survives to the database.
 * Legacy blobs store one flat list and it is already the answer.
 */
function densestSlices(analysis: StoredAnalysis): Slice[] {
  if (Array.isArray(analysis.slices)) return analysis.slices;
  const record = analysis.slices as Record<Difficulty, Slice[]>;
  for (const difficulty of ['expert', 'hard', 'normal', 'easy'] as const) {
    const list = record?.[difficulty];
    if (Array.isArray(list) && list.length > 0) return list;
  }
  return [];
}

/**
 * How much a note counts for when the budget is tight.
 *
 * Selection in `selectTier` is greedy by `strength × metricWeight`, and a
 * reconstructed pool has no detection-function value to offer. Quantisation is
 * the next best signal and it is the one the analyser already stored: a note on
 * the beat mattered more than the sixteenth decorating it, which is the same
 * ordering the onset strengths produced in the first place. Deterministic, and
 * derived only from persisted fields, so two clients agree.
 */
const STRENGTH_BY_QUANT: Record<number, number> = {
  1: 1,
  2: 0.86,
  3: 0.78,
  4: 0.72,
  6: 0.64,
  8: 0.58,
  16: 0.5,
};

/**
 * Rebuild the charter's input from a note list.
 *
 * Runs the real `quantizeOnsets`, rather than hand-filling `beatIndex` /
 * `fraction` / `beatLength`: those three fields drive `metricWeight`, and a
 * hand-rolled copy of the snapping arithmetic is a second implementation of the
 * grid — the thing §10 rejects for the renderer and which is no more welcome
 * here.
 */
export function poolFromSlices(
  slices: readonly Slice[],
  beats: readonly number[],
): QuantizedNote[] {
  const onsets: Onset[] = slices.map((slice) => ({
    time: slice.time,
    strength: STRENGTH_BY_QUANT[slice.quant ?? 16] ?? 0.5,
    frame: 0,
    // The pool has no spectrum any more, so lane bias is read back off the lane
    // the generator chose — which is what the bias produced the first time.
    lowRatio: slice.lane === 0 ? 1 : 0,
    highRatio: slice.lane === 0 ? 0 : 1,
    sustain: slice.type === 'LONG' ? (slice.duration ?? 0) : 0,
  }));
  return quantizeOnsets(onsets, beats.slice());
}
