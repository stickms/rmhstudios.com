/** Reading-challenge arithmetic (L3) — pure, so the pace line is testable. */

export interface Pace {
  /** What a steady reader would have done by `now`. */
  expected: number;
  /** done − expected, rounded; positive is ahead. */
  delta: number;
  status: 'done' | 'ahead' | 'on-track' | 'behind';
}

const DAY_MS = 86_400_000;

export function paceFor(done: number, target: number, year: number, now: Date): Pace {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const t = Math.min(Math.max(now.getTime(), start), end);
  const share = (t - start) / (end - start);
  const expected = Math.round(target * share * 10) / 10;
  const delta = Math.round((done - expected) * 10) / 10;
  if (done >= target) return { expected, delta, status: 'done' };
  // Within a third of a book (or ~2% of a page goal) counts as on track.
  const slack = Math.max(0.5, target * 0.02);
  const status = delta > slack ? 'ahead' : delta < -slack ? 'behind' : 'on-track';
  return { expected, delta, status };
}

export const daysLeftInYear = (year: number, now: Date) =>
  Math.max(0, Math.ceil((Date.UTC(year + 1, 0, 1) - now.getTime()) / DAY_MS));
