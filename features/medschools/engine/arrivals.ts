/**
 * "When results arrive" (owner 2026-11-23): when in the week and the day reports of one category reach the public
 * pages. Pure and client-safe. Only aggregates leave the server: a count per weekday, a count per hour, and per past
 * cycle the calendar day of its first report and of its median report. Never an individual timestamp.
 */

/** US Eastern, the zone the applicant community lives by; the chart says so. */
export const ARRIVAL_ZONE = 'America/New_York';
/** Fewer events than this and the chart is hidden: a histogram of a handful of points is a list of people. */
export const ARRIVALS_MIN = 10;
/** A cycle row needs at least this many events (the k floor of the other public figures). */
export const ARRIVAL_CYCLE_MIN = 3;

/** One group of the aggregate query: ISO weekday 1 (Monday) to 7, Eastern hour 0 to 23, and how many events. */
export interface ArrivalGroup {
  dow: number;
  hr: number;
  n: number;
}

export interface ArrivalShape {
  total: number;
  /** Monday first. */
  weekdays: number[];
  hours: number[];
}

export function shapeArrivals(groups: readonly ArrivalGroup[]): ArrivalShape {
  const weekdays = Array.from({ length: 7 }, () => 0);
  const hours = Array.from({ length: 24 }, () => 0);
  let total = 0;
  for (const g of groups) {
    if (!(g.dow >= 1 && g.dow <= 7 && g.hr >= 0 && g.hr <= 23) || !(g.n > 0)) continue;
    weekdays[g.dow - 1] = (weekdays[g.dow - 1] ?? 0) + g.n;
    hours[g.hr] = (hours[g.hr] ?? 0) + g.n;
    total += g.n;
  }
  return { total, weekdays, hours };
}

/** Is there enough to draw? */
export const enoughArrivals = (total: number): boolean => total >= ARRIVALS_MIN;
