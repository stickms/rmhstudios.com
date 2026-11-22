/**
 * How an attempt becomes an FSRS grade — pure, shared by every drill (staff cards, Sprint, ear
 * training), so "good" means the same thing everywhere.
 *
 * Only the first attempt counts. A miss is `again` even when Learning mode lets the learner try
 * again until they get it (otherwise a card they only found on the third try would be scheduled as
 * if they knew it). A right first answer is `easy` when it came fast, `hard` when it came slowly
 * and `good` between; a drill that does not time its answers passes no `ms` and gets `good`.
 *
 * `ms` is the time from the question being on screen (and, for ear training, audible) to the
 * answer, so a replay or a slow microphone never reads as a hard card: callers pass `null` when the
 * clock is not trustworthy.
 */
import type { Grade } from './schedule';

export interface Attempt {
  /** The first answer to the question was right. */
  right: boolean;
  /** Milliseconds to that first answer, or null when it was not timed. */
  ms: number | null;
}

export interface GradeTimes {
  /** At or under this a right answer is `easy`. */
  fastMs: number;
  /** At or over this a right answer is `hard`. */
  slowMs: number;
}

/** Reading a note off the staff: a practised reader names it inside two seconds. */
export const STAFF_TIMES: GradeTimes = { fastMs: 2000, slowMs: 7000 };
/** Hearing and naming an interval or chord takes longer than reading a note. */
export const EAR_TIMES: GradeTimes = { fastMs: 3500, slowMs: 12000 };
/** A Sprint prompt is a race, so its bands are tighter than the untimed flashcards'. */
export const SPRINT_TIMES: GradeTimes = { fastMs: 1500, slowMs: 5000 };
/** Reading an interval means counting lines and spaces (and semitones): slower than naming one note. */
export const INTERVAL_TIMES: GradeTimes = { fastMs: 3000, slowMs: 10000 };

export function gradeAttempt(a: Attempt, times: GradeTimes = STAFF_TIMES): Grade {
  if (!a.right) return 'again';
  const ms = a.ms;
  if (ms === null || !Number.isFinite(ms) || ms < 0) return 'good';
  if (ms <= times.fastMs) return 'easy';
  if (ms >= times.slowMs) return 'hard';
  return 'good';
}
