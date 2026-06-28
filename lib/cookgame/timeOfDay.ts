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
