/**
 * Slice It — the wider note vocabulary (`G2`, `G4`, `G6`) and chart-level
 * double time (`M4`).
 *
 * All three note features share one property that makes them safe to add: they
 * are **opt-in per chart**, and a chart that does not declare them behaves
 * exactly as it does today. Every chart in the database is 2-key, undirected
 * and roll-free, so none of this can change a note anybody has already played.
 *
 * Pure and browser-safe — the charter produces these, the engine consumes them,
 * and the editor needs to reason about them without either.
 */

import type { Slice } from './types';

/* ─── G2 — lane count ────────────────────────────────────────────────────── */

export const KEY_COUNTS = [2, 4, 6] as const;
export type KeyCount = (typeof KEY_COUNTS)[number];

export function isKeyCount(value: unknown): value is KeyCount {
  return typeof value === 'number' && (KEY_COUNTS as readonly number[]).includes(value);
}

/** 2 for anything that does not say — which is every chart that exists. */
export function keyCountOf(value: unknown): KeyCount {
  return isKeyCount(value) ? value : 2;
}

/** Analysis band edges, in Hz. */
const LANE_MIN_HZ = 30;
const LANE_MAX_HZ = 11_000;

/**
 * Which lane an onset belongs in, generalised from a binary to N bands.
 *
 * The existing rule — bass-dominant to lane 0, bright to lane 1 — is exactly
 * this function at `keys = 2`, which is what makes the generalisation safe: a
 * 2-key chart generated through here is the chart that was generated before.
 *
 * **Log-spaced, because pitch perception is.** A 4-key split at 200/800/3200 Hz
 * divides the spectrum evenly by ear; a linear split at 2750/5500/8250 Hz puts
 * every drum and every bass note in lane 0 and leaves lanes 2 and 3 for cymbals.
 */
export function assignLane(centroidHz: number, keys: number): number {
  const lanes = Math.max(1, Math.floor(keys));
  const clamped = Math.max(LANE_MIN_HZ, Math.min(LANE_MAX_HZ, centroidHz || LANE_MIN_HZ));
  const t = Math.log2(clamped / LANE_MIN_HZ) / Math.log2(LANE_MAX_HZ / LANE_MIN_HZ);
  return Math.min(lanes - 1, Math.max(0, Math.floor(t * lanes)));
}

/**
 * Fold a chart down to fewer lanes.
 *
 * For a player on a 2-key binding opening a 4-key chart. Folds by position, for
 * the same reason `C9`'s importer does: round-robin turns an alternating stream
 * into a jack, which is unplayable.
 */
export function foldToKeys(notes: readonly Slice[], from: number, to: number): Slice[] {
  if (to >= from) return notes.map((note) => ({ ...note }));
  const half = Math.ceil(from / 2);
  return notes.map((note) => ({
    ...note,
    lane: to === 2 ? (note.lane < half ? 0 : 1) : Math.min(to - 1, Math.floor((note.lane * to) / from)),
  }));
}

/* ─── G4 — directional slices ────────────────────────────────────────────── */

export const SLICE_DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
export type SliceDirection = (typeof SLICE_DIRECTIONS)[number];

/**
 * The gesture dead zone, in pixels.
 *
 * Below this the gesture was a tap, and reading a jittery tap as a swipe is
 * worse than ignoring direction entirely — it turns every touch player's normal
 * input into a random wrong-direction penalty.
 */
export const SWIPE_DEAD_ZONE_PX = 24;

export function directionOf(dx: number, dy: number): SliceDirection | undefined {
  if (Math.hypot(dx, dy) < SWIPE_DEAD_ZONE_PX) return undefined;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/**
 * Whether an input satisfies a note's direction requirement.
 *
 * Three rules, and the middle one is the whole reason this is a function rather
 * than an `===`:
 *
 *  1. A note with no direction accepts anything. An undirected chart costs
 *     nothing.
 *  2. **A note WITH a direction accepts an input that has none.** A keyboard
 *     player cannot express direction, and a directed chart that is unplayable
 *     on a keyboard is a chart most of the player base cannot open. It degrades
 *     to lane-only rather than refusing.
 *  3. A wrong direction from a device that CAN express one is wrong.
 */
export function satisfiesDirection(
  required: SliceDirection | undefined,
  given: SliceDirection | undefined,
): boolean {
  if (!required) return true;
  if (!given) return true;
  return required === given;
}

/* ─── G6 — rolls ─────────────────────────────────────────────────────────── */

/**
 * Points per hit inside a roll. Low, because a roll is many hits.
 *
 * A roll worth the same per hit as a note would make a 3-second roll worth more
 * than the bar around it, and the optimal play would be to find charts with
 * rolls in them.
 */
export const ROLL_HIT_POINTS = 25;

/**
 * Hits per second for full credit.
 *
 * **Capped, and the cap is the point.** Without it the optimal play is a turbo
 * controller: an input that a human cannot produce would outscore one they can,
 * which is the definition of a mechanic that rewards cheating. 12/s is faster
 * than a comfortable single-hand tremolo and slower than any autofire.
 */
export const ROLL_TARGET_HPS = 12;

export interface RollResult {
  hits: number;
  /** 0–1 against the target rate. */
  fill: number;
  points: number;
}

/**
 * Score a roll from its hit count and window.
 *
 * Rate-based rather than timing-based: the whole idea of a roll is that
 * individual hits are not judged, so scoring them individually would make it a
 * fast stream with a different colour.
 */
export function scoreRoll(hits: number, windowSeconds: number): RollResult {
  const window = Math.max(0.05, windowSeconds);
  const target = ROLL_TARGET_HPS * window;
  const counted = Math.max(0, Math.min(hits, target));
  const fill = target > 0 ? counted / target : 0;
  return { hits, fill, points: Math.round(counted * ROLL_HIT_POINTS) };
}

/**
 * Whether a run of onsets is dense enough and long enough to be a roll.
 *
 * A region where the detector's flux stays above threshold for longer than a
 * beat IS a roll — the signal already exists and the 55 ms quantisation filter
 * currently throws it away, charting a drum fill as a handful of taps or as
 * nothing.
 */
export function isRollRegion(onsetTimes: readonly number[], beatSeconds: number): boolean {
  if (onsetTimes.length < 5) return false;
  const span = onsetTimes[onsetTimes.length - 1] - onsetTimes[0];
  if (span < beatSeconds) return false;
  return onsetTimes.length / span >= 8;
}

/* ─── M4 — chart-level double time ───────────────────────────────────────── */

/**
 * Speeds a chart may declare it is designed for.
 *
 * `M4` is not the existing `speed` modifier: that one is a PLAYER setting that
 * changes playback rate and is scored with a multiplier. This is a CHART
 * property — a charter saying "this chart is written to be played at 1.5x" —
 * which means the notes were placed against the sped-up audio and the chart is
 * simply what it is at that rate.
 */
export const CHART_RATES = [1, 1.25, 1.5, 2] as const;
export type ChartRate = (typeof CHART_RATES)[number];

export function isChartRate(value: unknown): value is ChartRate {
  return typeof value === 'number' && (CHART_RATES as readonly number[]).includes(value);
}

/**
 * Rewrite a chart's times for a different playback rate.
 *
 * Times AND durations, which is the part that is easy to get half right: a hold
 * whose start moves but whose length does not ends somewhere the audio is not.
 *
 * The note IDs are preserved so a rate change does not invalidate a chart hash
 * computed over identities — the hash is over times too, so it changes, but the
 * notes are recognisably the same notes.
 */
export function retime(notes: readonly Slice[], rate: number): Slice[] {
  const factor = rate > 0 ? 1 / rate : 1;
  return notes.map((note) => ({
    ...note,
    time: note.time * factor,
    ...(note.duration !== undefined ? { duration: note.duration * factor } : {}),
  }));
}

/**
 * The score multiplier a chart-declared rate earns.
 *
 * **None.** A chart written at 1.5x is a chart; its notes are where they are and
 * hitting them is exactly as hard as the chart makes it. Paying a bonus for it
 * would mean every charter maximising score by declaring a rate, and the
 * leaderboard for that chart would still be one board — so the bonus would be
 * free points for everyone rather than a difficulty adjustment.
 *
 * The PLAYER-side `speed` modifier keeps its multiplier, because that one
 * genuinely changes the chart out from under the notes.
 */
export function chartRateMultiplier(): number {
  return 1;
}
