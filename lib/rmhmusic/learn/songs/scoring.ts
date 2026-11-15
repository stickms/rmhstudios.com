/**
 * Scoring a song — pure, shared by the game and the server, which recomputes every kept score from
 * the per-note results with these same functions (the client's own score is never read).
 *
 * - **Wait for me:** each note scores {@link waitPoints} of the wrong notes played before it: 100
 *   first time, 50 after one, 0 after more. The score is their mean.
 * - **Play along:** each note is right (the right pitch inside its window), wrong (another pitch
 *   answered it) or missed. A right note scores {@link timingPoints} — the tap lesson's windows
 *   (`scoring/timing.ts`): 100 within `PERFECT_MS`, falling linearly to 0 at `ZERO_MS` — and a
 *   wrong or missed note 0. A note that answered no note costs `EXTRA_TAP_COST` of a note, as in
 *   `tapScore`, so hammering keys cannot help. The score is the total over the notes, 0..100.
 *
 * Stars are `starsFor` of the score, as in every lesson.
 */
import { scoreFromPoints, starsFor, type Stars } from '../scoring/stars';
import { EXTRA_TAP_COST, PERFECT_MS, ZERO_MS } from '../scoring/timing';
import { notesOf, type Song } from './score';

export type SongMode = 'wait' | 'play';
export const SONG_MODES: readonly SongMode[] = ['wait', 'play'];

export function isSongMode(v: unknown): v is SongMode {
  return v === 'wait' || v === 'play';
}

/**
 * The microphone reports a note once its pitch has held for a few 25 ms frames, so a mic note-on
 * arrives after the note was struck; play along takes this much back from a mic note's time (ms).
 * Reasoned from the segmenter (three frames, the first already into the note), not measured.
 */
export const MIC_ONSET_MS = 60;

/** The most wrong notes counted against one note (a stored count stays small). */
export const MAX_WRONG = 99;

export function waitPoints(wrong: number): number {
  if (!Number.isFinite(wrong) || wrong < 0) return 0;
  return wrong === 0 ? 100 : wrong === 1 ? 50 : 0;
}

export function timingPoints(offMs: number): number {
  if (!Number.isFinite(offMs)) return 0;
  const d = Math.abs(offMs);
  if (d <= PERFECT_MS) return 100;
  if (d >= ZERO_MS) return 0;
  return (100 * (ZERO_MS - d)) / (ZERO_MS - PERFECT_MS);
}

export interface PlayNoteResult {
  outcome: 'right' | 'wrong' | 'missed';
  /** How far from its beat the note was played (ms, after latency); null when missed. */
  offMs: number | null;
}

export interface SongSummary {
  score: number;
  stars: Stars;
  /** Notes right (play along: in time and pitch; wait for me: first time). */
  right: number;
  total: number;
  /** Play along: right notes more than `PERFECT_MS` early or late. */
  early: number;
  late: number;
  /** Wait for me: notes with a wrong note before them. Play along: notes answered wrongly. */
  wrong: number;
  missed: number;
  extras: number;
}

export function summarizeWait(wrong: readonly number[]): SongSummary {
  const score = scoreFromPoints(wrong.map(waitPoints));
  const right = wrong.filter((w) => w === 0).length;
  return {
    score,
    stars: starsFor(score),
    right,
    total: wrong.length,
    early: 0,
    late: 0,
    wrong: wrong.length - right,
    missed: 0,
    extras: 0,
  };
}

export function summarizePlay(notes: readonly PlayNoteResult[], extras: number): SongSummary {
  let points = 0;
  let right = 0;
  let early = 0;
  let late = 0;
  let wrong = 0;
  let missed = 0;
  for (const n of notes) {
    if (n.outcome === 'right' && n.offMs !== null) {
      right++;
      points += timingPoints(n.offMs);
      if (n.offMs < -PERFECT_MS) early++;
      else if (n.offMs > PERFECT_MS) late++;
    } else if (n.outcome === 'wrong') wrong++;
    else missed++;
  }
  const extra = Number.isFinite(extras) ? Math.max(0, extras) : 0;
  const score =
    notes.length === 0
      ? 0
      : Math.min(100, Math.max(0, Math.round((points - extra * EXTRA_TAP_COST * 100) / notes.length)));
  return { score, stars: starsFor(score), right, total: notes.length, early, late, wrong, missed, extras: extra };
}

/** A finished run as the game sends it to be kept. */
export type SongRunRecord =
  | { mode: 'wait'; wrong: readonly number[] }
  | { mode: 'play'; notes: readonly PlayNoteResult[]; extras: number };

/**
 * The server's check: a run of this song with one result per note, each possible, re-scored here.
 * Null when it is not a possible run.
 */
export function checkSongRun(song: Song, run: SongRunRecord): SongSummary | null {
  const n = notesOf(song).length;
  if (run.mode === 'wait') {
    if (run.wrong.length !== n) return null;
    if (!run.wrong.every((w) => Number.isInteger(w) && w >= 0 && w <= MAX_WRONG)) return null;
    return summarizeWait(run.wrong);
  }
  if (run.notes.length !== n) return null;
  if (!Number.isInteger(run.extras) || run.extras < 0 || run.extras > 4 * n) return null;
  for (const r of run.notes) {
    if (r.outcome === 'missed') {
      if (r.offMs !== null) return null;
    } else if (r.offMs === null || !Number.isFinite(r.offMs) || Math.abs(r.offMs) > ZERO_MS) return null;
  }
  return summarizePlay(run.notes, run.extras);
}
