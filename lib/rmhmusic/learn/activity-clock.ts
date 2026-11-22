/**
 * How long the activity on screen has taken, for the practice log (`durationMs` on the bodies of
 * lesson, song, sprint and card-review saves). Client only. A screen calls `beginActivity()` when
 * the learner starts (a lesson opens, Start is pressed, a Practice session is dealt); the save
 * reads `activityDurationMs()` and calls `endActivity()` once the server has it. It is a
 * difference of two `performance.now()` readings: no timer and no animation frame. A retried save
 * reads the clock again, so Retry reports the time up to the retry; a save with no start recorded
 * (a replay with no new Start) sends no duration, and counts as an activity, not as minutes.
 */
import { MAX_DURATION_MS } from '@/lib/rmhmusic/history';

let startedAt: number | null = null;

/** The learner started an activity now (or at `now`, a `performance.now()` reading). */
export function beginActivity(now: number = performance.now()): void {
  startedAt = now;
}

/** Whole ms since `beginActivity`, capped at the log's two-hour limit; undefined when none began. */
export function activityDurationMs(now: number = performance.now()): number | undefined {
  if (startedAt === null) return undefined;
  return Math.min(MAX_DURATION_MS, Math.max(0, Math.round(now - startedAt)));
}

/** The activity's result is kept: the next save needs a new `beginActivity`. */
export function endActivity(): void {
  startedAt = null;
}
