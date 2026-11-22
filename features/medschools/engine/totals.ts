import { PRIMARY_ORDER } from './public-read';
import type { ActivityTypeDto, MedChartedTypeId, MedSourceId } from '../medschools.contract';

export interface TotalsMatrix {
  /** The columns: every source that has a figure for any category, in primary order. */
  sources: MedSourceId[];
  /** One row per category with at least one source; `cells` lines up with `sources`. */
  rows: { eventType: MedChartedTypeId; cells: ({ total: number; primary: boolean } | null)[] }[];
}

/** Category by source, so the totals read as one small table (rows = category, columns = source) and not 15 lines. */
export function buildTotalsMatrix(types: readonly ActivityTypeDto[]): TotalsMatrix {
  const present = new Set<MedSourceId>(types.flatMap((ty) => ty.sources.map((s) => s.source)));
  const sources = PRIMARY_ORDER.filter((s) => present.has(s));
  const rows = types
    .filter((ty) => ty.sources.length > 0)
    .map((ty) => ({
      eventType: ty.eventType,
      cells: sources.map((source) => {
        const s = ty.sources.find((x) => x.source === source);
        return s ? { total: s.total, primary: s.source === ty.primary } : null;
      }),
    }));
  return { sources, rows };
}
