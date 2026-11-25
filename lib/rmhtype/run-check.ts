/**
 * The one check every scored RMHType run goes through (sprint 12 17). Pure and client-safe; the socket hub, the
 * challenge settlement, the pages and the tests share it.
 *
 * A run is scored from the server's own figures: its clock, the passage and a clamped position, never from what the
 * client claims. The check answers one question, "did this run reach the end of the passage at a speed and along a
 * curve a person could have typed?", and when the answer is no it says why, so the result can tell the member.
 */
import {
  GHOST_DURATION_TOLERANCE_MS,
  GHOST_DURATION_TOLERANCE_RATIO,
  GHOST_STEP_MS,
  MAX_CHARS_PER_STEP,
  isSampleArray,
} from '@/lib/rmhtype/ghost';
import { MAX_WPM } from '@/lib/rmhtype/typing-run';

/**
 * Why a run was not ranked: it did not reach the end of the passage (`short`), it computes above {@link MAX_WPM}
 * (`too-fast`), or its progress curve is missing or not believable for the run (`implausible`).
 */
export type RunReason = 'short' | 'too-fast' | 'implausible';

/** The server's own figures for a finished run, as the settlement and the scoring read them. */
export interface RaceFigures {
  /** Whether the run counts as a full-length finish that passed every check. */
  finished: boolean;
  /** Why it did not (`null` when it did). */
  reason: RunReason | null;
  wpm: number;
  accuracy: number;
  timeMs: number;
  /** The position the figures were computed from, clamped to the passage length. */
  position: number;
  /** The error count the figures were computed from, clamped to the position. */
  errors: number;
}

/**
 * A client's reported position and error count, made safe to score: whole numbers, the position within the passage
 * and the errors within the position. Anything that is not a finite number counts as 0. Every RMHType run the hub
 * scores (a challenge race, an ordinary solo run, live progress) goes through this, so no client figure can raise a
 * speed past what the passage allows or push accuracy outside 0 to 100.
 */
export function clampRunCounts(
  position: unknown,
  errors: unknown,
  passageLength: number,
): { position: number; errors: number } {
  const raw = typeof position === 'number' && Number.isFinite(position) ? position : 0;
  const clampedPosition = Math.min(Math.max(0, Math.floor(raw)), Math.max(0, passageLength));
  const rawErrors = typeof errors === 'number' && Number.isFinite(errors) ? errors : 0;
  return { position: clampedPosition, errors: Math.min(Math.max(0, Math.floor(rawErrors)), clampedPosition) };
}

/**
 * A step may add this many characters (twice the steady ceiling): a fast honest typist's 250 ms windows swing well past
 * the average (an average of 230 WPM is under 5 characters a step, and its peaks are not), and a mobile keyboard can
 * insert a whole word in one event. The speed ceiling itself is held by the whole-run figure against the server's clock.
 */
const MAX_BURST_CHARS = MAX_CHARS_PER_STEP * 2;
/** Any one second (four steps) may add this many characters, so a burst cannot be repeated step after step. */
const MAX_SECOND_CHARS = Math.ceil(MAX_CHARS_PER_STEP * 4 * 1.5);

/**
 * Whether a finish's curve is believable for the run: whole non-negative numbers in a bounded array (checked before
 * any walk), ending at the passage length, within max(500 ms, 5%) of the server's time, never going back, and no
 * burst beyond what {@link MAX_BURST_CHARS} and {@link MAX_SECOND_CHARS} allow. Looser per step than the ghost's own
 * `isPlausibleGhost` on purpose: a ranked run must not be refused for a fast honest typist's peak.
 */
function isPlausibleCurve(samples: unknown, run: { passageLength: number; timeMs: number }): boolean {
  if (!isSampleArray(samples)) return false;
  if (!(run.passageLength > 0) || !(run.timeMs > 0)) return false;
  if (samples[samples.length - 1] !== run.passageLength) return false;
  const tolerance = Math.max(GHOST_DURATION_TOLERANCE_MS, run.timeMs * GHOST_DURATION_TOLERANCE_RATIO);
  if (Math.abs(samples.length * GHOST_STEP_MS - run.timeMs) > tolerance) return false;
  let prev = 0;
  for (let i = 0; i < samples.length; i++) {
    const n = samples[i]!;
    if (n < prev || n - prev > MAX_BURST_CHARS) return false;
    if (i >= 3 && n - (samples[i - 4] ?? 0) > MAX_SECOND_CHARS) return false;
    if (i < 3 && n > MAX_SECOND_CHARS) return false;
    prev = n;
  }
  return true;
}

/**
 * Judge a finish from the server's clock and the passage, never from the client's say-so. The position is clamped to
 * the passage length; the run is a finish only when the clamped position IS the passage length, the speed computed
 * from the server's time is at most {@link MAX_WPM}, and the curve passes {@link isPlausibleCurve} against that time
 * and length. Anything else is not a finish, and `reason` says which check failed first, in that order. Accuracy
 * still comes from the client's error count (a residual risk the specification records), clamped to what the
 * position allows.
 */
export function evaluateFinish(input: {
  passageLength: number;
  position: unknown;
  errors: unknown;
  /** The server's measure of the run, in ms. */
  timeMs: number;
  samples: unknown;
}): RaceFigures {
  const { passageLength, timeMs } = input;
  const { position, errors } = clampRunCounts(input.position, input.errors, passageLength);
  if (!(timeMs > 0) || position <= 0) {
    return { finished: false, reason: 'short', wpm: 0, accuracy: 0, timeMs: Math.max(0, timeMs), position, errors };
  }
  const wpm = position / 5 / (timeMs / 60000);
  const accuracy = ((position - errors) / position) * 100;
  let reason: RunReason | null = null;
  if (position !== passageLength) reason = 'short';
  else if (!(wpm <= MAX_WPM)) reason = 'too-fast';
  else if (!isPlausibleCurve(input.samples, { passageLength, timeMs })) reason = 'implausible';
  return { finished: reason === null, reason, wpm, accuracy, timeMs, position, errors };
}

/**
 * Live room progress, made safe: positions only go forward (never below `previous`), never past the passage, and
 * never faster than {@link MAX_CHARS_PER_STEP} per {@link GHOST_STEP_MS} since the last progress event (`elapsedMs`,
 * rounded up to a whole step's share so a fast honest burst is not cut). O(1) per event.
 */
export function clampProgress(previous: number, next: unknown, passageLength: number, elapsedMs: number): number {
  const ceiling = Math.max(0, Math.floor(passageLength));
  const from = Math.min(Math.max(0, Math.floor(Number.isFinite(previous) ? previous : 0)), ceiling);
  const raw = typeof next === 'number' && Number.isFinite(next) ? Math.floor(next) : from;
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const allowance = Math.ceil((MAX_CHARS_PER_STEP * elapsed) / GHOST_STEP_MS);
  return Math.min(Math.max(raw, from), ceiling, from + allowance);
}
