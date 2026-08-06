/**
 * Slice It chart editor — the editor's own types.
 *
 * These are **client-side only**: they never cross the wire. The wire shape is
 * `Slice[]`, unchanged from `lib/slice-it/types.ts` — {@link toSlices} is the one
 * place the editor fields are dropped.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §1.2.
 *
 * Browser-free and Node-free, like the rest of `lib/slice-it`: the esbuild
 * server bundle compiles this tree directly.
 */

import type { Difficulty, Slice, SliceType } from '@/lib/slice-it/types';

export type { Difficulty, Slice, SliceType };

/**
 * A tempo marker.
 *
 * Lives here rather than in `lib/slice-it/types.ts` because that module is owned
 * elsewhere and no generated chart carries timing points yet — every chart today
 * is one constant BPM (`Song.bpm`), which {@link singleTimingPoint} expresses.
 * The request to promote this into the shared types module is recorded in
 * `docs/_handoff/chart-editor-requests.md`.
 */
export interface TimingPoint {
  /** Seconds from the start of the track. */
  time: number;
  bpm: number;
  /** Beats per measure. 4 unless a chart says otherwise. */
  meter: number;
}

/** A scroll-velocity marker (G10). Phase 8 — carried through, never edited yet. */
export interface SvPoint {
  time: number;
  multiplier: number;
}

/** The timing map every generated chart has: one point, the song's own BPM. */
export function singleTimingPoint(bpm: number, meter = 4): TimingPoint[] {
  return [{ time: 0, bpm: bpm > 0 ? bpm : 120, meter }];
}

/** A note plus the editor state that is never persisted. */
export interface EditorNote extends Slice {
  /**
   * Selection state. Kept on the note rather than in a Set so the renderer needs
   * one pass, not a pass plus N lookups.
   */
  selected?: boolean;
  /**
   * True when this note came from the generator and has not been touched. Drives
   * the "auto" tint (§7.3) so an author can see what they have and have not
   * reviewed.
   */
  auto?: boolean;
  /** Set by the linter (§9 — phase 7). Rendered as a warning ring. */
  issues?: LintIssue[];
}

export interface LintIssue {
  code:
    | 'unhittable-jack' // same lane faster than INPUT_COOLDOWN_MS
    | 'too-early' // inside the first 2s, before the player can react
    | 'hold-too-short' // shorter than its own release window
    | 'density-spike' // above the tier's readable ceiling
    | 'empty-stretch' // >8s with nothing
    | 'off-grid' // not near any subdivision of the beat
    | 'nesting-violation'; // present at a lower tier but not a higher one
  severity: 'error' | 'warning';
  message: string;
}

/** One difficulty's editable state. */
export interface EditorChart {
  difficulty: Difficulty;
  keys: number;
  name: string;
  notes: EditorNote[];
  /** Set when the in-memory notes differ from what was last saved. */
  dirty: boolean;
  /** Null until the rater runs (C3). */
  rating: number | null;
}

export type Charts = Record<Difficulty, EditorChart>;

export type SnapDivision = 1 | 2 | 3 | 4 | 6 | 8 | 12 | 16 | 24 | 32;

/** Offered by the toolbar, coarsest first. */
export const SNAP_DIVISIONS: readonly SnapDivision[] = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32];

export type EditorTool =
  | 'select' // box select, drag, the default
  | 'place' // click to add a note of `placeType`
  | 'erase' // click/drag to remove
  | 'hold' // drag to author a LONG note (phase 2: head-only, tail via inspector)
  | 'timing'; // edit timing points / SV points (phase 8)

/**
 * How hard the editor enforces Easy ⊆ Normal ⊆ Hard ⊆ Expert (§7.2).
 *
 * `cascade` is the default because a human editing four independent lists breaks
 * the invariant within ten minutes and never notices.
 */
export type NestingMode = 'cascade' | 'warn' | 'off';

/**
 * Drop the fields that only exist while editing.
 *
 * The wire shape is `Slice`, so `selected`/`auto`/`issues` — and the engine's own
 * runtime render state `hit`/`hitTime` — must not reach the `Json` column. The
 * `auto` flag is the one loss that matters, and it is re-derived on load from the
 * chart's `isGenerated` flag rather than persisted per note (§7.3 is a session
 * affordance, not a durable property of a note).
 */
export function toSlice(note: EditorNote): Slice {
  const slice: Slice = {
    id: note.id,
    time: note.time,
    type: note.type,
    lane: note.lane,
  };
  if (note.duration != null) slice.duration = note.duration;
  if (note.speedMultiplier != null) slice.speedMultiplier = note.speedMultiplier;
  return slice;
}

export function toSlices(notes: readonly EditorNote[]): Slice[] {
  return notes.map(toSlice);
}

/** The inverse: adopt a stored note list, tagging every note with `auto`. */
export function toEditorNotes(slices: readonly Slice[], auto: boolean): EditorNote[] {
  return slices.map((slice) => ({ ...toSlice(slice), auto }));
}
