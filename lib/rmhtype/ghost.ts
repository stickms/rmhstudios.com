/**
 * RMHType ghosts: a best run kept as a coarse progress curve, so the next attempt on the
 * same passage can race it. Pure and client-safe; the handler, the page and the tests share it.
 *
 * A ghost is POSITIONS ONLY: `samples[k]` is how many characters the member had typed
 * `(k + 1) * GHOST_STEP_MS` after the run started. It carries no key identities and no errors
 * (see `./keystats` for the same rule about per-key counters), so it cannot be turned back into
 * what was typed.
 */
import { MAX_WPM } from '@/lib/rmhtype/typing-run';

/** One sample every 250 ms. */
export const GHOST_STEP_MS = 250;
/** Ten minutes of samples. */
export const MAX_GHOST_SAMPLES = 2400;
/** A member keeps at most this many ghosts; the least recently raced is evicted. */
export const MAX_GHOSTS_PER_MEMBER = 500;
/** A ghost is only kept for a run at or above this accuracy (the leaderboard's own bar). */
export const MIN_GHOST_ACCURACY = 90;
/** The run's duration and the curve's may differ by this much, or by {@link GHOST_DURATION_TOLERANCE_RATIO} of it if more. */
export const GHOST_DURATION_TOLERANCE_MS = 500;
/** Slow connections skew the client's clock against the server's by a share of the run, so the bound scales. */
export const GHOST_DURATION_TOLERANCE_RATIO = 0.05;
/** The most characters one 250 ms step can add at {@link MAX_WPM}, rounded up. */
export const MAX_CHARS_PER_STEP = Math.ceil((MAX_WPM * 5 * GHOST_STEP_MS) / 60000);

/** The run a curve claims to describe, as the server measured it. */
export interface GhostRun {
  /** Length of the passage text, in characters. */
  passageLength: number;
  timeMs: number;
}

/** A curve a client could send: whole numbers, in a bounded array. */
export function isSampleArray(samples: unknown): samples is number[] {
  return (
    Array.isArray(samples) &&
    samples.length > 0 &&
    samples.length <= MAX_GHOST_SAMPLES &&
    samples.every((n) => Number.isInteger(n) && n >= 0)
  );
}

/**
 * Whether a curve is believable for the run it came with: monotonic, ending at the passage
 * length, lasting within max(500 ms, 5%) of the server's time, and never faster than a person types.
 */
export function isPlausibleGhost(samples: unknown, run: GhostRun): samples is number[] {
  if (!isSampleArray(samples)) return false;
  if (!(run.passageLength > 0) || !(run.timeMs > 0)) return false;
  if (samples[samples.length - 1] !== run.passageLength) return false;
  const tolerance = Math.max(GHOST_DURATION_TOLERANCE_MS, run.timeMs * GHOST_DURATION_TOLERANCE_RATIO);
  if (Math.abs(samples.length * GHOST_STEP_MS - run.timeMs) > tolerance) return false;
  let prev = 0;
  for (const n of samples) {
    if (n < prev) return false;
    if (n - prev > MAX_CHARS_PER_STEP) return false;
    prev = n;
  }
  return true;
}

/**
 * Turn the moments a member's typed length changed into the stored curve.
 * `marks` are `[elapsedMs, typedLength]` in time order; the result is the typed length at each
 * 250 ms step up to `timeMs`, the last step ending at the final length.
 */
export function buildSamples(marks: ReadonlyArray<readonly [number, number]>, timeMs: number): number[] {
  const steps = Math.min(MAX_GHOST_SAMPLES, Math.max(1, Math.ceil(timeMs / GHOST_STEP_MS)));
  const out: number[] = [];
  let i = 0;
  let at = 0;
  for (let k = 1; k <= steps; k++) {
    const until = k * GHOST_STEP_MS;
    while (i < marks.length && marks[i]![0] <= until) {
      at = marks[i]![1];
      i++;
    }
    out.push(at);
  }
  const last = marks.length ? marks[marks.length - 1]![1] : 0;
  out[out.length - 1] = last;
  return out;
}

/**
 * How many characters the ghost had typed `elapsedMs` into the run, interpolating between
 * samples. Past the end it stays at the passage length; before the start it is 0.
 */
export function ghostPositionAt(samples: readonly number[], elapsedMs: number): number {
  if (samples.length === 0 || !(elapsedMs > 0)) return 0;
  const exact = elapsedMs / GHOST_STEP_MS;
  if (exact >= samples.length) return samples[samples.length - 1]!;
  const lower = Math.floor(exact);
  const from = lower === 0 ? 0 : samples[lower - 1]!;
  const to = samples[lower]!;
  return from + (to - from) * (exact - lower);
}

/** Positive: the member finished that many ms ahead of the ghost. Negative: behind. */
export function aheadByMs(ghostTimeMs: number, runTimeMs: number): number {
  return Math.round(ghostTimeMs - runTimeMs);
}

/** Seconds with one decimal, for "Ahead of your best by 1.4 s". */
export function formatGapSeconds(ms: number): string {
  return (Math.abs(ms) / 1000).toFixed(1);
}
