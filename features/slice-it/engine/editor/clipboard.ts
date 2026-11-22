/**
 * Slice It chart editor — clipboard, mirror, quantise, scale and time edits.
 *
 * Spec: `docs/autonomous/sprint-07/features/01-slice-it-clipboard.md`; design doc
 * `docs/slice-it-chart-editor.md` §5.2.
 *
 * Pure: every function takes the editor's state as an {@link EditContext} and
 * returns an {@link Outcome} — a `Command` (or null when nothing would change,
 * so a no-op is never an undo step) and a summary of codes and counts. The store
 * applies the command; the UI translates the summary. Nothing here reads the
 * system clipboard: the clipboard is the editor's own, in memory.
 */

import {
  bundle,
  clampLane,
  firstIndexAtOrAfter,
  pasteNotes,
  quantizeTime,
  rewriteNotes,
  shiftTime,
  TIME_EPSILON,
  type Command,
  type TimingMap,
} from './commands';
import { nestedDelete, noteKey, TIER_ORDER } from './nesting';
import { beatAt, meterAt, snapStepSeconds, snapTime, timeAtBeat } from './snap';
import type {
  Charts,
  Difficulty,
  EditorNote,
  NestingMode,
  SliceType,
  SnapDivision,
  SvPoint,
  TimingPoint,
} from './types';
import { newNoteId } from './uuid';

/** Scale timing's range, in percent. */
export const SCALE_MIN_PERCENT = 50;
export const SCALE_MAX_PERCENT = 200;

/** One copied note: time relative to the earliest copied note. */
export interface ClipNote {
  dt: number;
  lane: number;
  type: SliceType;
  duration?: number;
  speedMultiplier?: number;
}

/** The editor's own clipboard (in memory, per tab). */
export interface ClipboardData {
  /** The key count of the chart the notes were copied from. */
  keys: number;
  notes: ClipNote[];
}

/** Everything an operation needs from the editor, passed in so this stays pure. */
export interface EditContext {
  charts: Charts;
  difficulty: Difficulty;
  keys: number;
  nesting: NestingMode;
  timingPoints: readonly TimingPoint[];
  svPoints: readonly SvPoint[];
  snap: SnapDivision;
  snapEnabled: boolean;
  playhead: number;
}

/**
 * What happened, as codes and counts. The UI turns it into a sentence; engine
 * code never produces user-facing text.
 */
export type ClipboardResult =
  | { code: 'nothing-selected' }
  | { code: 'clipboard-empty' }
  | { code: 'nothing-changed' }
  | { code: 'copied'; count: number }
  | { code: 'cut'; count: number }
  | { code: 'pasted'; count: number; clamped: number; skipped: number; mirrored: boolean }
  | { code: 'duplicated'; count: number; clamped: number; skipped: number }
  | { code: 'mirrored'; count: number; skipped: number }
  | { code: 'quantized'; count: number; merged: number; division: SnapDivision }
  | { code: 'scaled'; count: number; merged: number; percent: number }
  | { code: 'inserted'; at: number; division: SnapDivision; moved: number }
  | { code: 'removed'; at: number; division: SnapDivision; moved: number; deleted: number };

export interface Outcome {
  command: Command | null;
  result: ClipboardResult;
  /** Ids to select on the active difficulty once the command has applied. */
  select?: string[];
}

const byTime = (a: EditorNote, b: EditorNote) => a.time - b.time;

/** True when a note list is exactly the notes that carry `selected`. */
export function selectionOf(ctx: Pick<EditContext, 'charts' | 'difficulty'>): EditorNote[] {
  return ctx.charts[ctx.difficulty].notes.filter((note) => note.selected);
}

/** The tiers an edit to `difficulty` reaches: the nesting cascade, or just the one. */
function tiersFor(difficulty: Difficulty, nesting: NestingMode, direction: 'up' | 'all'): Difficulty[] {
  if (nesting !== 'cascade') return [difficulty];
  const index = TIER_ORDER.indexOf(difficulty as (typeof TIER_ORDER)[number]);
  if (index < 0) return [difficulty];
  return direction === 'up' ? TIER_ORDER.slice(index) : TIER_ORDER.slice();
}

/* ─── copy ────────────────────────────────────────────────────────────────── */

/** Copy the selection. Null when nothing is selected. */
export function copySelection(
  selection: readonly EditorNote[],
  keys: number,
): ClipboardData | null {
  if (selection.length === 0) return null;
  const sorted = selection.slice().sort(byTime);
  const t0 = sorted[0].time;
  return {
    keys,
    notes: sorted.map((note) => {
      const clip: ClipNote = {
        dt: quantizeTime(note.time - t0),
        lane: note.lane,
        type: note.type,
      };
      if (note.duration != null) clip.duration = note.duration;
      if (note.speedMultiplier != null) clip.speedMultiplier = note.speedMultiplier;
      return clip;
    }),
  };
}

/* ─── paste ───────────────────────────────────────────────────────────────── */

/**
 * Place clipboard notes with the earliest at `at` (already snapped or not — the
 * caller decides). Lanes clamp into the chart's key count, never wrap; a note
 * that lands on an existing note in the same lane (same millisecond), or on an
 * earlier pasted note after clamping, is skipped.
 */
function placeClip(
  ctx: EditContext,
  clip: ClipboardData,
  at: number,
  mirrored: boolean,
  label: string,
): { command: Command | null; ids: string[]; count: number; clamped: number; skipped: number } {
  const keys = Math.max(1, ctx.keys);
  const tiers = tiersFor(ctx.difficulty, ctx.nesting, 'up');
  let clamped = 0;
  const built: EditorNote[] = [];
  for (const clipNote of clip.notes) {
    const lane = clampLane(clipNote.lane, keys);
    if (lane !== clipNote.lane) clamped++;
    const note: EditorNote = {
      id: newNoteId(),
      time: Math.max(0, quantizeTime(at + clipNote.dt)),
      type: clipNote.type,
      lane: mirrored ? keys - 1 - lane : lane,
      auto: false,
    };
    if (clipNote.duration != null) note.duration = clipNote.duration;
    if (clipNote.speedMultiplier != null) note.speedMultiplier = clipNote.speedMultiplier;
    built.push(note);
  }

  const commands: Command[] = [];
  let activeIds: string[] = [];
  let skipped = 0;
  for (const tier of tiers) {
    const chart = ctx.charts[tier];
    if (!chart) continue;
    const occupied = new Set(chart.notes.map(noteKey));
    const added: EditorNote[] = [];
    for (const note of built) {
      const key = noteKey(note);
      if (occupied.has(key)) continue;
      occupied.add(key);
      // A fresh id per tier: the lists are independent (nesting.ts, cascadePlace).
      added.push(tier === ctx.difficulty ? note : { ...note, id: newNoteId() });
    }
    if (tier === ctx.difficulty) {
      skipped = built.length - added.length;
      activeIds = added.map((n) => n.id);
    }
    if (added.length > 0) commands.push(pasteNotes(tier, added, label));
  }
  return {
    command: bundle(label, commands),
    ids: activeIds,
    count: activeIds.length,
    clamped,
    skipped,
  };
}

/** Paste at the playhead (snapped when snap is on), optionally mirrored. */
export function pasteAt(
  ctx: EditContext,
  clip: ClipboardData | null,
  mirrored = false,
): Outcome {
  if (!clip || clip.notes.length === 0) return { command: null, result: { code: 'clipboard-empty' } };
  const at = ctx.snapEnabled
    ? snapTime(ctx.playhead, ctx.snap, ctx.timingPoints)
    : ctx.playhead;
  const placed = placeClip(ctx, clip, at, mirrored, mirrored ? 'Paste mirrored' : 'Paste');
  return {
    command: placed.command,
    result: {
      code: 'pasted',
      count: placed.count,
      clamped: placed.clamped,
      skipped: placed.skipped,
      mirrored,
    },
    select: placed.ids,
  };
}

/**
 * One measure after the selection's first note, in the timing point in force
 * there. Walks beats rather than multiplying by a BPM, so a bar that crosses a
 * tempo change is the right length.
 */
export function measureAfter(time: number, points: readonly TimingPoint[]): number {
  const meter = meterAt(time, points);
  const beat = beatAt(time, points);
  return timeAtBeat(beat + meter, points) - time;
}

/** Copy the selection and paste it one measure after its first note. */
export function duplicateSelection(ctx: EditContext): Outcome {
  const selection = selectionOf(ctx);
  const clip = copySelection(selection, ctx.keys);
  if (!clip) return { command: null, result: { code: 'nothing-selected' } };
  const t0 = selection.reduce((min, n) => Math.min(min, n.time), Infinity);
  const at = quantizeTime(t0 + measureAfter(t0, ctx.timingPoints));
  const placed = placeClip(ctx, clip, at, false, 'Duplicate');
  return {
    command: placed.command,
    result: {
      code: 'duplicated',
      count: placed.count,
      clamped: placed.clamped,
      skipped: placed.skipped,
    },
    select: placed.ids,
  };
}

/** Cut = copy + delete (through the nesting cascade, like Delete). */
export function cutSelection(ctx: EditContext): Outcome & { clipboard: ClipboardData | null } {
  const selection = selectionOf(ctx);
  const clipboard = copySelection(selection, ctx.keys);
  if (!clipboard) {
    return { command: null, result: { code: 'nothing-selected' }, clipboard: null };
  }
  return {
    command: nestedDelete(ctx.nesting, ctx.charts, ctx.difficulty, selection),
    result: { code: 'cut', count: selection.length },
    clipboard,
  };
}

/* ─── in-place rewrites: mirror, quantise, scale ──────────────────────────── */

interface RewriteSummary {
  /** Active-tier notes that changed. */
  changed: number;
  /** Active-tier notes that were merged away (merge) or left alone (skip). */
  collided: number;
}

/**
 * Apply `transform` to the selection, and to its twins in the other tiers when
 * the nesting cascade is on (a note is the same musical note in every tier it
 * appears in, matched by {@link noteKey} — see `cascadeMove`).
 *
 * A transformed note that would land on a note that stays put collides. For
 * `merge` (quantise, scale) the moving note is dropped, so the earlier one of a
 * colliding pair survives (targets are processed in time order); for `skip`
 * (mirror) the note stays where it was.
 */
function rewriteSelection(
  ctx: EditContext,
  kind: 'mirror' | 'quantize' | 'scale',
  label: string,
  selection: readonly EditorNote[],
  transform: (note: EditorNote) => EditorNote,
  onCollision: 'merge' | 'skip',
): { command: Command | null; summary: RewriteSummary } {
  const selectedKeys = new Set(selection.map(noteKey));
  const commands: Command[] = [];
  const summary: RewriteSummary = { changed: 0, collided: 0 };

  for (const tier of tiersFor(ctx.difficulty, ctx.nesting, 'all')) {
    const chart = ctx.charts[tier];
    if (!chart) continue;
    const targets =
      tier === ctx.difficulty
        ? selection.slice().sort(byTime)
        : chart.notes.filter((n) => selectedKeys.has(noteKey(n)));
    if (targets.length === 0) continue;
    const targetIds = new Set(targets.map((n) => n.id));
    const occupied = new Set<string>();
    for (const note of chart.notes) if (!targetIds.has(note.id)) occupied.add(noteKey(note));

    const before: EditorNote[] = [];
    const after: EditorNote[] = [];
    let changed = 0;
    let collided = 0;
    // Notes that do not move hold their place before any other note is placed.
    const moving: { note: EditorNote; next: EditorNote }[] = [];
    for (const note of targets) {
      const next = transform(note);
      if (next.time === note.time && next.lane === note.lane && next.duration === note.duration) {
        occupied.add(noteKey(note));
      } else {
        moving.push({ note, next });
      }
    }
    for (const { note, next } of moving) {
      const key = noteKey(next);
      if (occupied.has(key)) {
        collided++;
        if (onCollision === 'skip') {
          occupied.add(noteKey(note));
          continue;
        }
        before.push(note); // merged away: in `before`, absent from `after`
        continue;
      }
      occupied.add(key);
      before.push(note);
      after.push(next);
      changed++;
    }
    if (tier === ctx.difficulty) {
      summary.changed = changed;
      summary.collided = collided;
    }
    if (before.length > 0) commands.push(rewriteNotes(kind, label, tier, before, after));
  }
  return { command: bundle(label, commands), summary };
}

/** `H` / the menu: lane `l` becomes `keys - 1 - l`, in place. */
export function mirrorLanes(ctx: EditContext): Outcome {
  const selection = selectionOf(ctx);
  if (selection.length === 0) return { command: null, result: { code: 'nothing-selected' } };
  const keys = Math.max(1, ctx.keys);
  const { command, summary } = rewriteSelection(
    ctx,
    'mirror',
    'Mirror notes',
    selection,
    (note) => ({ ...note, lane: keys - 1 - clampLane(note.lane, keys), auto: false }),
    'skip',
  );
  // A selection that is its own mirror image (a centred chord) changes nothing.
  if (!command) return { command: null, result: { code: 'nothing-changed' } };
  return {
    command,
    result: { code: 'mirrored', count: summary.changed, skipped: summary.collided },
  };
}

/**
 * `Q`: snap each selected note's time (and a hold's tail) to the snap division.
 * Colliding notes merge into the earlier one.
 */
export function quantizeSelection(ctx: EditContext): Outcome {
  const selection = selectionOf(ctx);
  if (selection.length === 0) return { command: null, result: { code: 'nothing-selected' } };
  const step = (time: number) => snapStepSeconds(time, ctx.snap, ctx.timingPoints);
  const { command, summary } = rewriteSelection(
    ctx,
    'quantize',
    'Quantize notes',
    selection,
    (note) => {
      const time = Math.max(0, quantizeTime(snapTime(note.time, ctx.snap, ctx.timingPoints)));
      const next: EditorNote = { ...note, time, auto: false };
      if (note.duration != null && note.duration > 0) {
        const tail = quantizeTime(snapTime(note.time + note.duration, ctx.snap, ctx.timingPoints));
        // A hold never collapses to nothing: its tail stays at least one snap unit out.
        next.duration = quantizeTime(tail > time ? tail - time : step(time));
      }
      return next;
    },
    'merge',
  );
  if (!command) return { command: null, result: { code: 'nothing-changed' } };
  return {
    command,
    result: {
      code: 'quantized',
      count: summary.changed + summary.collided,
      merged: summary.collided,
      division: ctx.snap,
    },
  };
}

/** `Ctrl+Shift+S`: stretch the selection about its first note, 50–200 %. */
export function scaleSelection(ctx: EditContext, percent: number): Outcome {
  const selection = selectionOf(ctx);
  if (selection.length === 0) return { command: null, result: { code: 'nothing-selected' } };
  const clamped = Math.round(Math.max(SCALE_MIN_PERCENT, Math.min(SCALE_MAX_PERCENT, percent)));
  const factor = clamped / 100;
  const t0 = selection.reduce((min, n) => Math.min(min, n.time), Infinity);
  const { command, summary } = rewriteSelection(
    ctx,
    'scale',
    'Scale timing',
    selection,
    (note) => {
      const next: EditorNote = {
        ...note,
        time: Math.max(0, quantizeTime(t0 + (note.time - t0) * factor)),
        auto: false,
      };
      if (note.duration != null) next.duration = quantizeTime(note.duration * factor);
      return next;
    },
    'merge',
  );
  if (!command) return { command: null, result: { code: 'nothing-changed' } };
  return {
    command,
    result: {
      code: 'scaled',
      count: summary.changed + summary.collided,
      merged: summary.collided,
      percent: clamped,
    },
  };
}

/* ─── insert / remove time ────────────────────────────────────────────────── */

/**
 * Points after the cut, moved by `delta` (positive inserts, negative removes).
 *
 * `protectFirst` keeps the first timing point where it is: the grid starts there.
 * When removing, points strictly inside the removed span cannot keep their time;
 * the last of them is the tempo in force after the span, so it moves to the cut
 * and the others are dropped.
 */
function shiftPoints<P extends { time: number }>(
  points: readonly P[],
  at: number,
  delta: number,
  protectFirst: boolean,
): P[] {
  const cut = at - TIME_EPSILON;
  const out: P[] = [];
  const end = delta < 0 ? at - delta : at;
  let lastInSpan: P | null = null;
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    if (protectFirst && index === 0) {
      out.push(point);
      continue;
    }
    if (point.time < cut) {
      out.push(point);
    } else if (delta >= 0) {
      out.push({ ...point, time: quantizeTime(point.time + delta) });
    } else if (point.time < end - TIME_EPSILON) {
      lastInSpan = point;
    } else {
      out.push({ ...point, time: quantizeTime(point.time + delta) });
    }
  }
  if (lastInSpan) {
    const moved = { ...lastInSpan, time: quantizeTime(at) };
    if (!out.some((p) => Math.abs(p.time - moved.time) < TIME_EPSILON)) out.push(moved);
  }
  return out.sort((a, b) => a.time - b.time);
}

function shiftOutcome(ctx: EditContext, direction: 'insert' | 'remove'): Outcome {
  const at = ctx.snapEnabled ? snapTime(ctx.playhead, ctx.snap, ctx.timingPoints) : ctx.playhead;
  const unit = snapStepSeconds(at, ctx.snap, ctx.timingPoints);
  const delta = direction === 'insert' ? unit : -unit;
  const cut = at - TIME_EPSILON;
  const end = at + unit;

  const tails = {} as Record<Difficulty, { before: EditorNote[]; after: EditorNote[] }>;
  let moved = 0;
  let deleted = 0;
  for (const difficulty of TIER_ORDER) {
    const notes = ctx.charts[difficulty].notes;
    const before = notes.slice(firstIndexAtOrAfter(notes, cut));
    const after: EditorNote[] = [];
    for (const note of before) {
      if (direction === 'remove' && note.time < end - TIME_EPSILON) {
        deleted++;
        continue;
      }
      after.push({ ...note, time: Math.max(0, quantizeTime(note.time + delta)) });
      moved++;
    }
    tails[difficulty] = { before, after };
  }

  const timingBefore: TimingMap = {
    timingPoints: ctx.timingPoints.slice(),
    svPoints: ctx.svPoints.slice(),
  };
  const timingAfter: TimingMap = {
    timingPoints: shiftPoints(ctx.timingPoints, at, delta, true),
    svPoints: shiftPoints(ctx.svPoints, at, delta, false),
  };
  const pointsChanged =
    JSON.stringify(timingAfter) !== JSON.stringify(timingBefore);
  if (moved === 0 && deleted === 0 && !pointsChanged) {
    return { command: null, result: { code: 'nothing-changed' } };
  }
  const command = shiftTime(
    direction === 'insert' ? 'Insert time' : 'Remove time',
    at,
    tails,
    timingBefore,
    timingAfter,
  );
  return {
    command,
    result:
      direction === 'insert'
        ? { code: 'inserted', at, division: ctx.snap, moved }
        : { code: 'removed', at, division: ctx.snap, moved, deleted },
  };
}

/** `Ctrl+I`: shift everything at or after the playhead later by one snap unit, on every difficulty. */
export function insertTime(ctx: EditContext): Outcome {
  return shiftOutcome(ctx, 'insert');
}

/** `Ctrl+Shift+L`: delete one snap unit at the playhead and close the gap, on every difficulty. */
export function removeTime(ctx: EditContext): Outcome {
  return shiftOutcome(ctx, 'remove');
}
