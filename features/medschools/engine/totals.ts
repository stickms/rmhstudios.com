import { PRIMARY_ORDER } from './public-read';
import type { ActivityTypeDto, MedEventTypeId, MedSchoolActivityRes, MedSourceId } from '../medschools.contract';

export interface TotalsMatrix {
  /** The columns: every source that has a figure for any category, in primary order. */
  sources: MedSourceId[];
  /** One row per category with at least one source; `cells` lines up with `sources`. */
  rows: { eventType: MedEventTypeId; cells: ({ total: number; primary: boolean } | null)[] }[];
}

/** Category by source, so the totals read as one small table (rows = category, columns = source) and not 15 lines. */
export function buildTotalsMatrix(
  types: readonly ActivityTypeDto[],
  other: MedSchoolActivityRes['otherTotals'] = [],
): TotalsMatrix {
  const present = new Set<MedSourceId>([
    ...types.flatMap((ty) => ty.sources.map((s) => s.source)),
    ...other.flatMap((o) => o.sources.map((s) => s.source)),
  ]);
  const sources = PRIMARY_ORDER.filter((s) => present.has(s));
  const rows: TotalsMatrix['rows'] = types
    .filter((ty) => ty.sources.length > 0)
    .map((ty) => ({
      eventType: ty.eventType,
      cells: sources.map((source) => {
        const s = ty.sources.find((x) => x.source === source);
        return s ? { total: s.total, primary: s.source === ty.primary } : null;
      }),
    }));
  // Withdrawn and hold are totals only (never charted); their bold cell is the first source in primary order.
  for (const o of other) {
    if (o.sources.length === 0) continue;
    const primary = PRIMARY_ORDER.find((s) => o.sources.some((x) => x.source === s));
    rows.push({
      eventType: o.eventType,
      cells: sources.map((source) => {
        const s = o.sources.find((x) => x.source === source);
        return s ? { total: s.total, primary: s.source === primary } : null;
      }),
    });
  }
  return { sources, rows };
}
