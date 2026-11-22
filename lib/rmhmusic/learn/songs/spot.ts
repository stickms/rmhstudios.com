/**
 * Spot practice — pure. After a play-along or a Wait for me run, the bars that went wrong are drilled
 * on their own: found from the run's per-note results, cut into at most three short segments (each with
 * one bar of lead-in for context), and looped at a tempo that starts slow and follows how the passes go.
 *
 * **What a spot run is not.** It is never scored and never saved. A segment is played as a song of its
 * own (`segmentSong`: just those bars), through the same machine as any run, but the screen gives it the
 * saver that keeps nothing (`createMemorySongSaver`), and a record of a segment has fewer notes than the
 * song, so the server's `checkSongRun` rejects it even if it were sent. Nothing here touches a best.
 *
 * **A problem note** is one the run got wrong: a Wait for me note with a wrong note before it; a play-along
 * note that was missed, answered with the wrong pitch, or right but so far from its beat that it earned
 * less than half the points ({@link SLOPPY_POINTS}). Bars are ranked by how many.
 *
 * **Tempo** (play along only; Wait for me has no tempo): a segment starts at {@link START_TEMPO_PCT} of
 * the song's tempo. A clean pass (no problem note) speeds it up by {@link TEMPO_STEP_PCT} points to at
 * most {@link MAX_TEMPO_PCT}; a pass with {@link SLOW_DOWN_AT} or more problems drops it one step, to at
 * least {@link MIN_TEMPO_PCT}; one or two problems repeat the same tempo. A clean pass at full tempo
 * is "mastered": the loop stops by itself.
 */
import { notesOf, type Song } from './score';
import { timingPoints, type SongMode, type SongRunRecord } from './scoring';

/** A right note that earned fewer points than this (so it was far from its beat) counts as a problem. */
export const SLOPPY_POINTS = 50;
/** At most this many segments are offered. */
export const MAX_SEGMENTS = 3;
/** A run of weak bars longer than this is cut into pieces of this many (before the lead-in bar). */
export const MAX_SEGMENT_BARS = 4;
/** Two segments that touch are one, unless that would be longer than this many bars. */
export const MAX_MERGED_BARS = MAX_SEGMENT_BARS + 2;

export const START_TEMPO_PCT = 60;
export const TEMPO_STEP_PCT = 10;
export const MIN_TEMPO_PCT = 50;
export const MAX_TEMPO_PCT = 100;
/** A pass with this many problem notes or more drops the tempo one step. */
export const SLOW_DOWN_AT = 3;
/** The slowest tempo a metronome is asked for (a song written very slowly is not slowed to nothing). */
export const MIN_BPM = 20;

/** Which notes of a run were problems, by note index. A record longer or shorter than the song is read as far as it goes. */
export function problemNotes(record: SongRunRecord): boolean[] {
  if (record.mode === 'wait') return record.wrong.map((w) => Number.isFinite(w) && w > 0);
  return record.notes.map((n) => n.outcome !== 'right' || n.offMs === null || timingPoints(n.offMs) < SLOPPY_POINTS);
}

/** How many problem notes a run had. */
export function passProblems(record: SongRunRecord): number {
  let n = 0;
  for (const p of problemNotes(record)) if (p) n++;
  return n;
}

/** Problem notes per bar (indices into `song.bars`). */
export function barProblems(song: Song, record: SongRunRecord): number[] {
  const counts = song.bars.map(() => 0);
  const flags = problemNotes(record);
  notesOf(song).forEach((note, i) => {
    if (flags[i] === true) counts[note.bar] = (counts[note.bar] ?? 0) + 1;
  });
  return counts;
}

export interface SpotSegment {
  /** First and last bar to play, as indices into `song.bars` (the lead-in bar included). */
  from: number;
  to: number;
  /** The weak bars inside the segment. */
  weakFrom: number;
  weakTo: number;
  /** Problem notes in the weak bars. */
  problems: number;
  /** `from` and `to` as the score numbers bars: 0 is an opening pickup, the first full bar is 1. */
  fromNumber: number;
  toNumber: number;
}

/** The number the score gives a bar: an opening pickup is 0, the first full bar 1. */
export function barNumber(song: Song, bar: number): number {
  return bar + (song.pickup > 0 ? 0 : 1);
}

interface Draft {
  from: number;
  to: number;
  weakFrom: number;
  weakTo: number;
  problems: number;
}

/**
 * The bars worth drilling, worst first (ties in song order): runs of consecutive weak bars (a run longer
 * than {@link MAX_SEGMENT_BARS} is cut into pieces), each given one bar of lead-in before it; segments
 * that then touch are merged when the result stays short; at most {@link MAX_SEGMENTS} are kept, the ones
 * with the most problem notes. Empty when no note was a problem.
 */
export function spotSegments(song: Song, record: SongRunRecord): SpotSegment[] {
  const counts = barProblems(song, record);
  const drafts: Draft[] = [];
  let i = 0;
  while (i < counts.length) {
    if ((counts[i] ?? 0) === 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < counts.length && (counts[j] ?? 0) > 0) j++;
    for (let a = i; a < j; a += MAX_SEGMENT_BARS) {
      const b = Math.min(j - 1, a + MAX_SEGMENT_BARS - 1);
      let problems = 0;
      for (let k = a; k <= b; k++) problems += counts[k] ?? 0;
      drafts.push({ from: Math.max(0, a - 1), to: b, weakFrom: a, weakTo: b, problems });
    }
    i = j;
  }

  const merged: Draft[] = [];
  for (const d of drafts) {
    const last = merged[merged.length - 1];
    if (last && d.from <= last.to + 1 && d.to - last.from + 1 <= MAX_MERGED_BARS) {
      last.to = Math.max(last.to, d.to);
      last.weakTo = d.weakTo;
      last.problems += d.problems;
    } else merged.push({ ...d });
  }

  return merged
    .sort((a, b) => b.problems - a.problems || a.from - b.from)
    .slice(0, MAX_SEGMENTS)
    .map((d) => ({
      ...d,
      fromNumber: barNumber(song, d.from),
      toNumber: barNumber(song, d.to),
    }));
}

/** The segment as a song of its own (just its bars), for the machine and the score to play and draw. */
export function segmentSong(song: Song, segment: Pick<SpotSegment, 'from' | 'to'>): Song {
  return {
    ...song,
    bars: song.bars.slice(segment.from, segment.to + 1),
    // Only the song's own opening bar is a partial one; every other bar is full.
    pickup: segment.from === 0 ? song.pickup : 0,
  };
}

/** The metronome tempo at `pct` of the song's. */
export function spotBpm(song: Song, pct: number): number {
  const clamped = Math.min(MAX_TEMPO_PCT, Math.max(MIN_TEMPO_PCT, Number.isFinite(pct) ? pct : START_TEMPO_PCT));
  return Math.max(MIN_BPM, Math.round((song.bpm * clamped) / 100));
}

/** The tempo for the next pass, from this pass's tempo and how many notes it got wrong. */
export function nextTempoPct(pct: number, problems: number): number {
  const at = Math.min(MAX_TEMPO_PCT, Math.max(MIN_TEMPO_PCT, Number.isFinite(pct) ? pct : START_TEMPO_PCT));
  if (problems === 0) return Math.min(MAX_TEMPO_PCT, at + TEMPO_STEP_PCT);
  if (problems >= SLOW_DOWN_AT) return Math.max(MIN_TEMPO_PCT, at - TEMPO_STEP_PCT);
  return at;
}

export interface PassResult {
  /** Problem notes in the pass. */
  problems: number;
  clean: boolean;
  /** The tempo the pass was played at; null in Wait for me. */
  tempoPct: number | null;
  /** The tempo of the next pass; null in Wait for me. */
  nextTempoPct: number | null;
  /** A clean pass at full tempo (Wait for me: any clean pass): the bars are solid and the loop stops. */
  mastered: boolean;
}

export interface SpotState {
  segments: readonly SpotSegment[];
  /** Which segment is being drilled. */
  index: number;
  mode: SongMode;
  /** The tempo of the next pass; null in Wait for me. */
  tempoPct: number | null;
  /** Passes finished on this segment. */
  pass: number;
  /** The learner's loop switch: the next pass starts by itself after a short pause. */
  looping: boolean;
  /** The pass that just finished, null before the first. */
  last: PassResult | null;
}

export type SpotAction =
  | { type: 'open'; segments: readonly SpotSegment[]; mode: SongMode }
  | { type: 'pass'; record: SongRunRecord }
  | { type: 'next' }
  | { type: 'toggle-loop' }
  | { type: 'exit' };

function fresh(segments: readonly SpotSegment[], index: number, mode: SongMode, looping: boolean): SpotState {
  return {
    segments,
    index,
    mode,
    tempoPct: mode === 'play' ? START_TEMPO_PCT : null,
    pass: 0,
    looping,
    last: null,
  };
}

/** Spot practice as a reducer: null is off. */
export function spotReducer(state: SpotState | null, action: SpotAction): SpotState | null {
  if (action.type === 'open') return action.segments.length === 0 ? null : fresh(action.segments, 0, action.mode, true);
  if (state === null || action.type === 'exit') return null;
  switch (action.type) {
    case 'next':
      return fresh(state.segments, (state.index + 1) % state.segments.length, state.mode, true);
    case 'toggle-loop':
      return { ...state, looping: !state.looping };
    case 'pass': {
      const problems = passProblems(action.record);
      const clean = problems === 0;
      const playedAt = state.tempoPct;
      const next = playedAt === null ? null : nextTempoPct(playedAt, problems);
      const mastered = clean && (playedAt === null || playedAt >= MAX_TEMPO_PCT);
      return {
        ...state,
        tempoPct: next,
        pass: state.pass + 1,
        last: { problems, clean, tempoPct: playedAt, nextTempoPct: next, mastered },
      };
    }
  }
}

/** Whether the next pass should start by itself (the switch is on and the bars are not yet solid). */
export function autoLoops(state: SpotState): boolean {
  return state.looping && state.last?.mastered !== true;
}
