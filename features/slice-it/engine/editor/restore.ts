/**
 * Slice It chart editor — bringing an earlier version back.
 *
 * A version is a stored note list (`ChartRevision.notes`). Restoring is an EDIT, not a server write: the stored notes
 * replace one difficulty's notes as a single undoable command, and the member saves it through the chart's PATCH like
 * any other edit, so a published chart's lint still applies. Preview draws the same difference in the timeline's ghost
 * layer (the preview-before-apply drawing the generator uses) without touching the document.
 *
 * Pure: no store, no network. The component fetches the revision and hands the notes in.
 */

import { dayOf, isValidTimeZone } from '@/lib/calendar/tz';
import { sortNotes, withNotes, type Command } from './commands';
import { diffNotes, type DifficultyPlan } from './generate';
import { toEditorNotes, toSlice, type Difficulty, type EditorNote, type Slice } from './types';

/**
 * The editor notes a stored list becomes. A note that is in the current chart keeps its `auto` flag (it is the same
 * note); one that is not is the author's, since a version is something the author kept. Selection is view state and
 * is not carried.
 */
export function notesFromVersion(current: readonly EditorNote[], stored: readonly Slice[]): EditorNote[] {
  const auto = new Map(current.map((note) => [note.id, Boolean(note.auto)]));
  return sortNotes(toEditorNotes(stored, false).map((note) => ({ ...note, auto: auto.get(note.id) ?? false })));
}

/** True when two note lists say the same thing on the wire (id, time, lane, type, duration, speed), in order. */
export function sameNotes(a: readonly EditorNote[], b: readonly EditorNote[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (JSON.stringify(toSlice(a[i] as EditorNote)) !== JSON.stringify(toSlice(b[i] as EditorNote))) return false;
  }
  return true;
}

/**
 * Replace `difficulty`'s notes with a version's, inverting to exactly the notes it replaced (flags included).
 * Returns null when the version already is the chart: there is nothing to undo, so no history entry is made.
 */
export function restoreVersionCommand(
  difficulty: Difficulty,
  current: readonly EditorNote[],
  stored: readonly Slice[],
  label = 'Restore version',
): Command | null {
  const next = notesFromVersion(current, stored);
  if (sameNotes(sortNotes(current), next)) return null;
  const previous = current.slice();
  return {
    kind: 'restore',
    label,
    apply: (charts) => withNotes(charts, difficulty, () => next.slice()),
    invert: (charts) => withNotes(charts, difficulty, () => previous.slice()),
  };
}

/**
 * What Preview draws: notes the version has that the chart does not (outlined), and notes the chart has that the
 * version does not (struck through). Nothing here is the document.
 */
export function versionPreviewPlan(
  difficulty: Difficulty,
  current: readonly EditorNote[],
  stored: readonly Slice[],
): DifficultyPlan {
  const next = notesFromVersion(current, stored);
  const { added, removed } = diffNotes(current, next);
  return { difficulty, next, added, removed, keptAuthored: next.filter((note) => !note.auto).length };
}

/* ─── the list ────────────────────────────────────────────────────────────── */

export interface VersionGroup<T> {
  /** The calendar day in the member's zone, `YYYY-MM-DD`. */
  day: string;
  /** Newest first, as the server sent them. */
  items: T[];
}

/**
 * Group a newest-first list of versions by the day they were saved in `timeZone` (the member's own). Order is kept:
 * groups and the rows inside them stay newest first. An unknown zone falls back to UTC.
 */
export function groupVersionsByDay<T extends { createdAt: string }>(
  rows: readonly T[],
  timeZone: string,
): VersionGroup<T>[] {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const groups: VersionGroup<T>[] = [];
  for (const row of rows) {
    const day = dayOf(new Date(row.createdAt).getTime(), zone);
    const last = groups.at(-1);
    if (last && last.day === day) last.items.push(row);
    else groups.push({ day, items: [row] });
  }
  return groups;
}
