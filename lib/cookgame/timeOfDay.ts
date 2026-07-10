export const DAY_LENGTH_MS = 360_000; // 6 real minutes per in-game day

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

/** Advance the day clock by dtMs, wrapping into [0, DAY_LENGTH_MS). Robust to large/negative dt. */
export function advanceClock(clock: number, dtMs: number): number {
  const next = (clock + dtMs) % DAY_LENGTH_MS;
  return next < 0 ? next + DAY_LENGTH_MS : next;
}

/** Fraction of the day elapsed, in [0, 1). 0 = midnight, 0.5 = noon. */
export function dayFraction(clock: number): number {
  return clock / DAY_LENGTH_MS;
}

/** Coarse phase of day used by lighting and flavor. Boundaries are half-open. */
export function phaseOfDay(clock: number): DayPhase {
  const f = dayFraction(clock);
  if (f < 0.2 || f >= 0.8) return 'night';
  if (f < 0.3) return 'dawn';
  if (f < 0.7) return 'day';
  return 'dusk';
}

export type TimeWindow = { from: number; to: number };

// Canonical night window (wraps midnight). Lives here — the cycle-free leaf
// module — so shops.ts and content.ts share one definition without an import cycle.
export const NIGHT_WINDOW: TimeWindow = { from: 0.80, to: 0.20 };

const SUN_Z_TILT = 0.4; // constant south tilt so shadows fall at a pleasant angle

/** Normalized direction toward the sun for the given clock. */
export function sunDirection(clock: number): [number, number, number] {
  // theta = 0 at dawn (f=0.25, due east), PI/2 at noon (overhead), PI at dusk (due west).
  const theta = (dayFraction(clock) - 0.25) * 2 * Math.PI;
  const x = Math.cos(theta);
  const y = Math.sin(theta);
  const z = SUN_Z_TILT;
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

/** Is the (possibly wrap-around) window open at the given clock? Half-open [from, to). */
export function isOpenAt(window: TimeWindow, clock: number): boolean {
  const f = dayFraction(clock);
  const { from, to } = window;
  if (from <= to) return f >= from && f < to;
  return f >= from || f < to; // wraps past midnight
}
