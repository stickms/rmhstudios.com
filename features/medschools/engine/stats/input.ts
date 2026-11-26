/**
 * The forecast's inputs, read through the same public floor and primary rule the Activity chart uses (D2): an RMH row is
 * public only through `publishedCount` / `publishedContributors` at k >= 3 and dated before today, then the first source
 * present in `PRIMARY_ORDER` wins. Sources are never added to one another.
 *
 * Callers pass the rows of ONE school x program x event type (and one cycle).
 */
import { dayOfCycle } from '../cycle';
import { applyKFloor, buildTypeSeries, publicCell, type CountCell, type StoredCountRow } from '../public-read';
import type { MedSource } from '../types';
import type { DayCount } from './shares';

export interface PrimarySeries {
  source: MedSource;
  days: { date: string; count: number }[];
}

/** Stored rows as floored public cells: a suppressed or never-published RMH row is simply absent. */
function floored(rows: readonly StoredCountRow[], today: string): CountCell[] {
  const cells: CountCell[] = [];
  for (const r of rows) {
    const c = publicCell(r);
    if (c) cells.push({ source: c.source, date: c.date, count: c.count, contributors: c.contributors });
  }
  return applyKFloor(cells, today);
}

/**
 * The floored primary source's daily counts, or null when nothing public is left. `prefer` is the reader's chosen
 * source (`primaryOrder`): primary where it has data, else the usual order decides.
 */
export function primarySeriesOf(
  rows: readonly StoredCountRow[],
  today: string,
  prefer?: MedSource | null,
): PrimarySeries | null {
  const series = buildTypeSeries(floored(rows, today), today, prefer);
  const hit = series.sources.find((s) => s.source === series.primary);
  return hit ? { source: hit.source, days: hit.days } : null;
}

/** Every source with floored public data, in `PRIMARY_ORDER`, each its own daily counts. Never added together. */
export function seriesBySource(rows: readonly StoredCountRow[], today: string): PrimarySeries[] {
  return buildTypeSeries(floored(rows, today), today).sources.map((s) => ({ source: s.source, days: s.days }));
}

/** One named source's floored daily counts (history cycles use the SAME source as the current primary). */
export function seriesOfSource(
  rows: readonly StoredCountRow[],
  today: string,
  source: MedSource,
): { date: string; count: number }[] {
  return buildTypeSeries(floored(rows, today), today).sources.find((s) => s.source === source)?.days ?? [];
}

/** Calendar days to days since the cycle's day zero; drops nothing. */
export function toDayCounts(days: readonly { date: string; count: number }[], dayZeroOn: string): DayCount[] {
  return days.map((d) => ({ day: dayOfCycle(d.date, dayZeroOn), count: d.count }));
}
