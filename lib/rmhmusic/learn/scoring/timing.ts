/**
 * Scoring a run of taps against the beats of a metronome. Pure: the caller passes every time on
 * one clock (ms, the `performance.now()` clock the note events and `Metronome.beatTimes()` share).
 *
 * **Latency.** A tap lands after the beat it answers by the learner's setup — the click leaves the
 * speaker `outputLatency` after it is scheduled, the key or pad reports `inputLatency` after it is
 * pressed. The calibration (`calibration.ts`) measures the sum, against the SCHEDULED click times,
 * and saves it as the profile's `latencyMs`, so a calibrated value already includes the output
 * delay and is subtracted as it stands ({@link effectiveLatencyMs}). A learner who has never
 * calibrated has the default 0, which would score every honest tap as `OUTPUT_LATENCY_MS` late
 * and a bluetooth speaker as hopeless; for them {@link OUTPUT_LATENCY_MS} stands in. Either way
 * the latency is bounded to ±500 ms, so a wild saved value cannot drag taps onto beats they did
 * not answer.
 */

/** A tap within this of its beat is perfect (ms). */
export const PERFECT_MS = 70;
/** …falling linearly to nothing at this distance, and a tap further than this answers no beat (ms). */
export const ZERO_MS = 200;
/** A tap closer than this to the one before it is a key repeat or a bounce, not a tap (ms). */
export const DEBOUNCE_MS = 60;
/**
 * What an uncalibrated learner's setup is taken to add (ms): the browser's typical output delay
 * (an audio buffer or two, 20–60 ms on built-in speakers and wired headphones) plus the input
 * event's. Used only while the saved latency is 0 (the default; a measured 0 is not a thing a real
 * setup produces), so it is never added on top of a calibrated value.
 */
export const OUTPUT_LATENCY_MS = 40;
/** The most latency, either way, that is taken seriously (ms): the range the profile stores. */
export const MAX_LATENCY_MS = 500;
/**
 * What a tap that answers no beat — or a second tap for a beat already answered — costs, as a
 * fraction of one beat's full score, so hammering the pad cannot beat keeping time.
 */
export const EXTRA_TAP_COST = 0.5;

export interface TapScore {
  /** 0..100, whole. */
  score: number;
  /** Beats answered within {@link PERFECT_MS}. */
  hits: number;
  /** Beats answered more than {@link PERFECT_MS} before the beat. */
  early: number;
  /** Beats answered more than {@link PERFECT_MS} after the beat. */
  late: number;
}

const finiteSorted = (xs: readonly number[]) => xs.filter(Number.isFinite).sort((a, b) => a - b);

/** The latency to subtract for a profile's saved `latencyMs` (see the module docblock). */
export function effectiveLatencyMs(profileLatencyMs: number): number {
  if (!Number.isFinite(profileLatencyMs) || profileLatencyMs === 0) return OUTPUT_LATENCY_MS;
  return Math.min(MAX_LATENCY_MS, Math.max(-MAX_LATENCY_MS, profileLatencyMs));
}

/**
 * Score `taps` against `beatTimes` after subtracting `latencyMs`.
 *
 * Each tap (after the repeat filter) is matched, in time order, to the nearest beat not yet
 * answered, if one is within {@link ZERO_MS}: 100 up to {@link PERFECT_MS}, then falling linearly
 * to 0. A tap before the first beat's window or after the last one's is not part of the run (the
 * count-in, a tap before the clock started, the tail) and costs nothing; one inside the run that
 * answers no beat costs {@link EXTRA_TAP_COST}. The score is the mean over the beats, so a beat
 * never answered counts 0.
 */
export function tapScore(
  beatTimes: readonly number[],
  taps: readonly number[],
  latencyMs: number,
): TapScore {
  const beats = finiteSorted(beatTimes);
  const none: TapScore = { score: 0, hits: 0, early: 0, late: 0 };
  if (beats.length === 0) return none;
  const latency = Number.isFinite(latencyMs)
    ? Math.min(MAX_LATENCY_MS, Math.max(-MAX_LATENCY_MS, latencyMs))
    : 0;

  // Key repeat and bounce: judged against the previous tap of any kind, so a held key's whole run
  // of repeats goes, not every other one.
  const kept: number[] = [];
  let previous = -Infinity;
  for (const tap of finiteSorted(taps)) {
    if (tap - previous >= DEBOUNCE_MS) kept.push(tap - latency);
    previous = tap;
  }

  const from = beats[0] - ZERO_MS;
  const to = beats[beats.length - 1] + ZERO_MS;
  const answered = new Array<boolean>(beats.length).fill(false);
  let points = 0;
  let extras = 0;
  let hits = 0;
  let early = 0;
  let late = 0;
  for (const t of kept) {
    if (t < from || t > to) continue;
    let nearest = -1;
    for (let i = 0; i < beats.length; i++) {
      if (answered[i]) continue;
      if (nearest < 0 || Math.abs(t - beats[i]) < Math.abs(t - beats[nearest])) nearest = i;
    }
    const off = nearest < 0 ? Infinity : t - beats[nearest];
    const distance = Math.abs(off);
    if (distance > ZERO_MS) {
      extras++;
      continue;
    }
    answered[nearest] = true;
    points += distance <= PERFECT_MS ? 100 : (100 * (ZERO_MS - distance)) / (ZERO_MS - PERFECT_MS);
    if (distance <= PERFECT_MS) hits++;
    else if (off < 0) early++;
    else late++;
  }

  const score = (points - extras * EXTRA_TAP_COST * 100) / beats.length;
  return { score: Math.min(100, Math.max(0, Math.round(score))), hits, early, late };
}
