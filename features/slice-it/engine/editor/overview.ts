/**
 * Chart overview: the pure part of the density minimap and of issue navigation.
 *
 * Nothing here touches the DOM or the store, so the arithmetic (bins at the
 * song's edges, the order issues are visited in, which stretches are densest)
 * is testable without mounting the editor.
 */

import type { LintIssue } from './types';

export type IssueSeverity = LintIssue['severity'];

/** One flagged note, in the form navigation needs. */
export interface IssueRef {
  noteId: string;
  time: number;
  lane: number;
  /** The worst severity among the note's issues. */
  severity: IssueSeverity;
}

interface NoteLike {
  id: string;
  time: number;
  lane: number;
}

/** A lint finding, reduced to what the minimap's error ticks need. */
export interface FindingLike {
  time: number;
  severity: IssueSeverity;
  difficulty?: string;
}

/** One second of the song. */
export interface DensityBin {
  /** Notes starting in this second, which is also notes per second. */
  count: number;
  /** True when the count is above the tier's sustained ceiling. */
  over: boolean;
}

export interface DensityStretch {
  /** Seconds, inclusive start. */
  start: number;
  /** Seconds, exclusive end. */
  end: number;
  notes: number;
  /** Notes per second over the stretch. */
  nps: number;
}

/** Playhead times closer than this count as "the same place". */
const SAME_TIME = 0.001;

/** How far the minimap's arrow keys move, in seconds. */
export const MINIMAP_STEP_SECONDS = 5;

/**
 * One bin per second of the song.
 *
 * A note before 0 lands in the first bin and one at or after the end in the
 * last, so an edge note is never lost. Duration 0 (or not finite) is no bins.
 */
export function densityBins(noteTimes: readonly number[], duration: number, ceiling: number): DensityBin[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const length = Math.ceil(duration);
  const counts = new Array<number>(length).fill(0);
  for (const time of noteTimes) {
    if (!Number.isFinite(time)) continue;
    const index = Math.min(length - 1, Math.max(0, Math.floor(time)));
    counts[index] += 1;
  }
  return counts.map((count) => ({
    count,
    over: count > ceiling,
  }));
}

/**
 * Flagged notes in the order the author visits them: by time, then lane, then
 * id, so the order is stable and two flagged notes in a chord are two steps.
 */
export function issueOrder(notes: readonly NoteLike[], issues: ReadonlyMap<string, readonly LintIssue[]>): IssueRef[] {
  const refs: IssueRef[] = [];
  for (const note of notes) {
    const list = issues.get(note.id);
    if (!list || list.length === 0) continue;
    refs.push({
      noteId: note.id,
      time: note.time,
      lane: note.lane,
      severity: list.some((issue) => issue.severity === 'error') ? 'error' : 'warning',
    });
  }
  refs.sort((a, b) => a.time - b.time || a.lane - b.lane || (a.noteId < b.noteId ? -1 : a.noteId > b.noteId ? 1 : 0));
  return refs;
}

/**
 * The flagged note after the current one, wrapping from the last to the first.
 *
 * `currentId` is the selected note when there is one; otherwise the playhead
 * decides and the next flagged note strictly after it is returned.
 */
export function nextIssue(
  order: readonly IssueRef[],
  playhead: number,
  currentId: string | null = null,
): IssueRef | null {
  if (order.length === 0) return null;
  const at = currentId ? order.findIndex((ref) => ref.noteId === currentId) : -1;
  if (at >= 0) return order[(at + 1) % order.length];
  return order.find((ref) => ref.time > playhead + SAME_TIME) ?? order[0];
}

/** The flagged note before the current one, wrapping from the first to the last. */
export function prevIssue(
  order: readonly IssueRef[],
  playhead: number,
  currentId: string | null = null,
): IssueRef | null {
  if (order.length === 0) return null;
  const at = currentId ? order.findIndex((ref) => ref.noteId === currentId) : -1;
  if (at >= 0) return order[(at - 1 + order.length) % order.length];
  for (let i = order.length - 1; i >= 0; i--) {
    if (order[i].time < playhead - SAME_TIME) return order[i];
  }
  return order[order.length - 1];
}

/** Times of the findings that block publishing, for the minimap's ticks. */
export function errorTimes(findings: readonly FindingLike[], difficulty: string): number[] {
  const times: number[] = [];
  for (const finding of findings) {
    if (finding.severity !== 'error') continue;
    if (finding.difficulty !== undefined && finding.difficulty !== difficulty) continue;
    times.push(finding.time);
  }
  return times;
}

/**
 * The densest non-overlapping stretches of `span` seconds, densest first.
 * Stretches with no notes are never reported, so an empty chart has none.
 */
export function densestStretches(bins: readonly DensityBin[], count = 3, span = 5): DensityStretch[] {
  if (bins.length === 0 || count <= 0 || span <= 0) return [];
  const width = Math.min(span, bins.length);
  const prefix = new Array<number>(bins.length + 1).fill(0);
  for (let i = 0; i < bins.length; i++) prefix[i + 1] = prefix[i] + bins[i].count;
  const windows: DensityStretch[] = [];
  for (let start = 0; start + width <= bins.length; start++) {
    const notes = prefix[start + width] - prefix[start];
    if (notes > 0)
      windows.push({
        start,
        end: start + width,
        notes,
        nps: notes / width,
      });
  }
  windows.sort((a, b) => b.notes - a.notes || a.start - b.start);
  const picked: DensityStretch[] = [];
  for (const window of windows) {
    if (picked.length >= count) break;
    if (picked.some((other) => window.start < other.end && other.start < window.end)) continue;
    picked.push(window);
  }
  return picked;
}

/** The bin index under a pointer, as a time in seconds, clamped to the song. */
export function timeAtFraction(fraction: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(duration, fraction * duration));
}

/** `m:ss`, the form the slider's value text uses. */
export function clockText(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
