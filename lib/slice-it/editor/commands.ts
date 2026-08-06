/**
 * Slice It chart editor — every mutation as an undoable command.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §5.1.
 *
 * The alternative — snapshotting the whole note list per edit — is 90 KB per
 * keystroke on an Expert chart and makes a 200-step history 18 MB of live
 * objects. Commands hold the delta, which for the common case (place one note)
 * is one object.
 *
 * The property that makes undo trustworthy is `invert(apply(x)) === x`, for
 * every command, on every chart. `__tests__/commands.test.ts` asserts it
 * exhaustively; two rules keep it true and both are easy to break:
 *
 *  1. **A command that changes a note's fields carries the note it replaced**,
 *     not just the delta. `moveNotes` sets `auto: false` (§7.3), which a
 *     delta-only inverse cannot undo — it would move the note back and leave it
 *     marked as the author's.
 *  2. **Commands are pure and stateless.** Nothing is recorded during `apply`,
 *     so redo can run the same command any number of times and get the same
 *     result. Everything an inverse needs is captured at construction.
 */

import type { Charts, Difficulty, EditorNote, SliceType } from './types';

export type CommandKind =
  'place' | 'delete' | 'move' | 'retype' | 'set-duration' | 'select' | 'composite' | 'generate';

export interface Command {
  readonly kind: CommandKind;
  /** Already-translated? No — this is a debug/aria label, translated at the edge. */
  readonly label: string;
  apply(charts: Charts): Charts;
  invert(charts: Charts): Charts;
  /**
   * Optional: merge with the previous command so a 40-frame drag is ONE undo
   * step rather than forty. Returns null when the two are not the same gesture.
   */
  mergeWith?(previous: Command): Command | null;
}

/* ─── list helpers ────────────────────────────────────────────────────────── */

/**
 * The canonical order a note list is always in: time, then lane, then id.
 *
 * Time alone is not a total order — a chord is several notes at one timestamp —
 * and a partial order is not enough here for two reasons. `invert(apply(x))` has
 * to be `x` **including the array order**, which it cannot be if the position of
 * an equal-time note depends on whether it was just re-inserted; and the chart
 * hash (C12) is taken over the serialised list, so an order that drifts makes a
 * no-op edit look like a chart change to every leaderboard row.
 */
export function compareNotes(a: EditorNote, b: EditorNote): number {
  if (a.time !== b.time) return a.time - b.time;
  if (a.lane !== b.lane) return a.lane - b.lane;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Index of the first note that does not sort before `note`. */
export function lowerBound(notes: readonly EditorNote[], note: EditorNote): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (compareNotes(notes[mid], note) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Notes are kept sorted at all times — the renderer binary-searches the visible
 * window and the engine assumes time ordering.
 */
export function insertSorted(notes: readonly EditorNote[], note: EditorNote): EditorNote[] {
  const index = lowerBound(notes, note);
  return [...notes.slice(0, index), note, ...notes.slice(index)];
}

/** Put a note list into {@link compareNotes} order. */
export function sortNotes(notes: readonly EditorNote[]): EditorNote[] {
  return notes.slice().sort(compareNotes);
}

export function withNotes(
  charts: Charts,
  difficulty: Difficulty,
  update: (notes: EditorNote[]) => EditorNote[],
): Charts {
  const chart = charts[difficulty];
  return { ...charts, [difficulty]: { ...chart, notes: update(chart.notes), dirty: true } };
}

/** Lane moves clamp rather than wrap (§5.3) — the edge should feel like an edge. */
export function clampLane(lane: number, keys: number): number {
  return Math.max(0, Math.min(Math.max(1, keys) - 1, Math.round(lane)));
}

/**
 * Note times are stored to the microsecond.
 *
 * Not cosmetic. A drag emits one `moveNotes` per pointermove and the undo stack
 * collapses them into a single command carrying the SUMMED delta, so the same
 * gesture is computed two ways: `((t + d₁) + d₂)` while dragging, `t + (d₁ + d₂)`
 * on redo. In binary floating point those differ in the last bit, which makes
 * redo land a femtosecond away from where undo left — enough for a deep-equality
 * check, for the chart hash, and for a note to sort either side of a chord
 * partner. A microsecond is four orders of magnitude finer than the tightest hit
 * window (20 ms) and coarse enough to absorb the drift.
 */
export function quantizeTime(seconds: number): number {
  return Math.round(seconds * 1e6) / 1e6;
}

/* ─── the commands ────────────────────────────────────────────────────────── */

export function placeNote(difficulty: Difficulty, note: EditorNote): Command {
  return {
    kind: 'place',
    label: 'Place note',
    apply: (charts) => withNotes(charts, difficulty, (notes) => insertSorted(notes, note)),
    invert: (charts) =>
      withNotes(charts, difficulty, (notes) => notes.filter((n) => n.id !== note.id)),
  };
}

export function deleteNotes(difficulty: Difficulty, removed: readonly EditorNote[]): Command {
  const ids = new Set(removed.map((n) => n.id));
  const restored = removed.slice();
  return {
    kind: 'delete',
    label: removed.length === 1 ? 'Delete note' : `Delete ${removed.length} notes`,
    apply: (charts) =>
      withNotes(charts, difficulty, (notes) => notes.filter((n) => !ids.has(n.id))),
    invert: (charts) =>
      withNotes(charts, difficulty, (notes) =>
        sortNotes([...notes.filter((n) => !ids.has(n.id)), ...restored]),
      ),
  };
}

/**
 * Move a set of notes by a time and lane delta.
 *
 * `before` is the exact notes as they were, so the inverse restores them
 * field-for-field rather than subtracting the delta — which is what lets `apply`
 * clear the `auto` tint without the inverse having to guess it back.
 */
export function moveNotes(
  difficulty: Difficulty,
  before: readonly EditorNote[],
  deltaTime: number,
  deltaLane: number,
  keys: number,
): Command {
  const originals = before.slice();
  const byId = new Map(originals.map((n) => [n.id, n]));

  const moved = (): EditorNote[] =>
    originals.map((n) => ({
      ...n,
      time: Math.max(0, quantizeTime(n.time + deltaTime)),
      lane: clampLane(n.lane + deltaLane, keys),
      auto: false,
    }));

  const replace = (notes: readonly EditorNote[], next: readonly EditorNote[]): EditorNote[] => {
    const nextById = new Map(next.map((n) => [n.id, n]));
    return sortNotes(notes.map((n) => nextById.get(n.id) ?? n));
  };

  const command: Command = {
    kind: 'move',
    label: originals.length === 1 ? 'Move note' : `Move ${originals.length} notes`,
    apply: (charts) => withNotes(charts, difficulty, (notes) => replace(notes, moved())),
    invert: (charts) => withNotes(charts, difficulty, (notes) => replace(notes, originals)),
    /**
     * A drag emits one of these per pointermove. Merging collapses them so
     * Ctrl+Z undoes the gesture, not the last frame of it.
     *
     * The merged command keeps the EARLIER command's `before` (the state the
     * gesture started from) and the running total delta, so its inverse still
     * lands on where the notes were when the drag began.
     */
    mergeWith(previous) {
      if (previous.kind !== 'move') return null;
      const p = previous as MoveCommand;
      if (p.difficulty !== difficulty) return null;
      if (p.moveIds.length !== byId.size) return null;
      if (!p.moveIds.every((id) => byId.has(id))) return null;
      return moveNotes(
        difficulty,
        p.moveBefore,
        p.moveDeltaTime + deltaTime,
        p.moveDeltaLane + deltaLane,
        keys,
      );
    },
  };

  const withMeta = command as MoveCommand;
  withMeta.difficulty = difficulty;
  withMeta.moveIds = originals.map((n) => n.id);
  withMeta.moveBefore = originals;
  withMeta.moveDeltaTime = deltaTime;
  withMeta.moveDeltaLane = deltaLane;
  return withMeta;
}

/** The fields `moveNotes` exposes so a later move can merge with it. */
interface MoveCommand extends Command {
  difficulty: Difficulty;
  moveIds: string[];
  moveBefore: readonly EditorNote[];
  moveDeltaTime: number;
  moveDeltaLane: number;
}

/** Change a selection's note type — the `1`–`7` bindings in §5.2. */
export function retypeNotes(
  difficulty: Difficulty,
  before: readonly EditorNote[],
  type: SliceType,
): Command {
  const originals = before.slice();
  const next = originals.map((n) => ({
    ...n,
    type,
    // A type that has no duration must not keep one: a STANDARD note carrying a
    // stale `duration` renders as a hold in the game and as a point here.
    duration: type === 'LONG' ? (n.duration ?? 0.25) : undefined,
    speedMultiplier: type === 'SPEED' ? (n.speedMultiplier ?? 1.5) : undefined,
    auto: false,
  }));
  return replacementCommand('retype', `Set type to ${type}`, difficulty, originals, next);
}

/** Change a LONG note's length — the inspector's only numeric edit in phase 2. */
export function setDuration(
  difficulty: Difficulty,
  before: readonly EditorNote[],
  duration: number,
): Command {
  const originals = before.slice();
  const next = originals.map((n) => ({
    ...n,
    duration: Math.max(0, quantizeTime(duration)),
    auto: false,
  }));
  return replacementCommand('set-duration', 'Set hold length', difficulty, originals, next);
}

/**
 * The general shape behind `retype`/`setDuration`: swap a set of notes for a set
 * of replacements with the same ids, and swap them back on undo.
 */
function replacementCommand(
  kind: CommandKind,
  label: string,
  difficulty: Difficulty,
  originals: readonly EditorNote[],
  next: readonly EditorNote[],
): Command {
  const swap = (to: readonly EditorNote[]) => (notes: readonly EditorNote[]) => {
    const byId = new Map(to.map((n) => [n.id, n]));
    return sortNotes(notes.map((n) => byId.get(n.id) ?? n));
  };
  return {
    kind,
    label,
    apply: (charts) => withNotes(charts, difficulty, swap(next)),
    invert: (charts) => withNotes(charts, difficulty, swap(originals)),
  };
}

/**
 * Swap a difficulty's whole note list — what Apply in the AUTO panel commits.
 *
 * The one command that carries a snapshot rather than a delta, and deliberately:
 * a regenerate rewrites most of the chart, so the "delta" IS the list, and the
 * two arrays it holds are the two the editor already has in memory (the plan is
 * built before Apply is pressed). Undo has to restore the previous chart
 * exactly, `auto` flags included, or Ctrl+Z after a regenerate would leave every
 * surviving note claiming to be the author's.
 */
export function replaceChartNotes(
  difficulty: Difficulty,
  before: readonly EditorNote[],
  after: readonly EditorNote[],
  label = 'Generate notes',
): Command {
  const previous = before.slice();
  const next = after.slice();
  return {
    kind: 'generate',
    label,
    apply: (charts) => withNotes(charts, difficulty, () => next.slice()),
    invert: (charts) => withNotes(charts, difficulty, () => previous.slice()),
  };
}

/**
 * Several commands as one undo step.
 *
 * This is what makes the nesting cascade (§7.2) a single Ctrl+Z: placing a note
 * on Normal is four `placeNote`s, and undoing three quarters of that would leave
 * the invariant broken in a way the author never asked for.
 */
export function composite(label: string, commands: readonly Command[]): Command {
  const parts = commands.slice();
  return {
    kind: 'composite',
    label,
    apply: (charts) => parts.reduce((acc, command) => command.apply(acc), charts),
    // Reverse order: the inverse of (a then b) is (b⁻¹ then a⁻¹).
    invert: (charts) => parts.reduceRight((acc, command) => command.invert(acc), charts),
  };
}

/**
 * Fold a list of commands into one undo step, dropping the wrapper when there is
 * only one thing to do.
 */
export function bundle(label: string, commands: readonly Command[]): Command | null {
  if (commands.length === 0) return null;
  if (commands.length === 1) return commands[0];
  return composite(label, commands);
}
