/**
 * S2 — courses.
 *
 * A course is 3–5 charts played back to back on **one shared health gauge**.
 * The gauge carrying across songs is the whole of it: without that, a course is
 * a playlist with a scoreboard, and the game already has playlists (S8).
 *
 * ## The three rules, and why each is the way it is
 *
 * **1. The gauge always fails.** `healthGauge` is an opt-in modifier that
 * defaults to off, because a run that can end early is a different game and no
 * player should be put in one they did not ask for. A course is the ask.
 * Starting one IS opting in, so {@link courseModifiers} turns it on
 * unconditionally rather than reading the player's setting — a course you
 * cannot fail has no shared anything.
 *
 * **2. There is partial recovery between songs.** A course with no recovery is
 * a course whose length is a lie: one bad chart at 8% health means every
 * remaining song is a formality, so a five-song course is a one-song course
 * with four songs of theatre after it. {@link COURSE_RECOVERY} is enough that a
 * bad chart is survivable and two are not, which is the shape that makes the
 * middle of a course matter.
 *
 * **3. Score is cumulative and there are no retries.** A retry between songs
 * would make the shared gauge decorative — you would simply replay until the
 * gauge was full again.
 *
 * Pure and client-safe: no Prisma, no `Date.now`, no randomness. The state is a
 * value the caller advances; nothing here reaches for the engine or the store,
 * so the reducer can be tested on its own.
 *
 * ## Known gap — the engine does not yet START a song below full gauge
 *
 * `GameEngine.reset()` sets `health = HEALTH_MAX` unconditionally and exposes no
 * setter, and `engine.ts` is outside this change's ownership. So today the
 * course *tracks* the carried gauge, decides continuation and failure from it,
 * and shows it — but song N+1 begins at full health rather than at
 * `state.health`. The reducer is written for the finished behaviour so that
 * wiring it up is a one-line call at the run-start site once the engine takes a
 * starting health; nothing in this file changes. Filed in
 * `docs/_handoff/solo-modes-requests.md` §1.
 */

import { HEALTH_MAX } from './constants';
import { DEFAULT_MODIFIERS } from './modifiers';
import type { Modifiers } from './types';

/** Fewest charts that make a course. Two songs is a double, not a course. */
export const MIN_COURSE_SONGS = 3;
/** Most charts a course may hold. Beyond this it is an endurance bug report. */
export const MAX_COURSE_SONGS = 5;

/**
 * Health handed back between songs.
 *
 * Chosen against the failure shape rather than by feel: with the gauge's 100
 * ceiling, finishing a song at 30 and recovering 25 leaves 55 — a run that
 * survives one bad chart. Finishing two songs at 10 each does not, because the
 * recovery never outpaces two consecutive collapses. That is the intended
 * difficulty curve of a course, expressed as one number.
 */
export const COURSE_RECOVERY = 25;

/** A course in progress. */
export interface CourseState {
  /** Ordered song ids, `MIN_COURSE_SONGS`..`MAX_COURSE_SONGS` of them. */
  songIds: string[];
  /** Index of the song being played. Equals `songIds.length` when finished. */
  index: number;
  /** Carries across songs — the defining mechanic. */
  health: number;
  cumulativeScore: number;
  /** Per-song scores, in order, for the results screen. */
  scores: number[];
  /** Best combo across the whole course. */
  maxCombo: number;
}

/** What one finished song contributes. */
export interface CourseRunResult {
  score: number;
  /** Gauge value at the end of the song, 0–`HEALTH_MAX`. */
  health: number;
  maxCombo: number;
}

/** A course that ran out of gauge. */
export interface CourseFailure {
  status: 'failed';
  /** How many songs were completed before the failure. */
  clearedSongs: number;
  cumulativeScore: number;
}

export type CourseOutcome =
  | { status: 'continue'; state: CourseState }
  | { status: 'complete'; state: CourseState }
  | CourseFailure;

/** Is this list a legal course? */
export function isValidCourse(songIds: string[]): boolean {
  return songIds.length >= MIN_COURSE_SONGS && songIds.length <= MAX_COURSE_SONGS;
}

/**
 * The first `MAX_COURSE_SONGS` of a setlist, which is how a setlist becomes a
 * course. Returns null when there are not enough songs to make one.
 */
export function courseFromSongs(songIds: string[]): CourseState | null {
  const trimmed = songIds.slice(0, MAX_COURSE_SONGS);
  if (!isValidCourse(trimmed)) return null;
  return startCourse(trimmed);
}

/** A fresh course at full gauge. */
export function startCourse(songIds: string[]): CourseState {
  return {
    songIds,
    index: 0,
    health: HEALTH_MAX,
    cumulativeScore: 0,
    scores: [],
    maxCombo: 0,
  };
}

/**
 * The modifier set a course song is played on.
 *
 * `healthGauge: true` regardless of what the player has set, per rule 1. The
 * rest of their settings are respected — a course is about the gauge, not about
 * taking away speed or difficulty choices.
 */
export function courseModifiers(base: Partial<Modifiers> = {}): Modifiers {
  return { ...DEFAULT_MODIFIERS, ...base, healthGauge: true };
}

/**
 * Fold one finished song into the course.
 *
 * The gauge is checked BEFORE the recovery is applied, so a song that ended at
 * zero fails the course — recovery is a reward for surviving a song, not a
 * reprieve from not surviving it.
 */
export function advance(state: CourseState, run: CourseRunResult): CourseOutcome {
  if (run.health <= 0) {
    return {
      status: 'failed',
      clearedSongs: state.index,
      cumulativeScore: state.cumulativeScore,
    };
  }

  const next: CourseState = {
    ...state,
    index: state.index + 1,
    health: Math.min(HEALTH_MAX, run.health + COURSE_RECOVERY),
    cumulativeScore: state.cumulativeScore + run.score,
    scores: [...state.scores, run.score],
    maxCombo: Math.max(state.maxCombo, run.maxCombo),
  };

  return next.index >= next.songIds.length
    ? { status: 'complete', state: next }
    : { status: 'continue', state: next };
}

/** The song id to load next, or null when the course is over. */
export function currentSongId(state: CourseState): string | null {
  return state.songIds[state.index] ?? null;
}

/** Human-readable position, e.g. "3 / 5". */
export function coursePosition(state: CourseState): string {
  return `${Math.min(state.index + 1, state.songIds.length)} / ${state.songIds.length}`;
}
