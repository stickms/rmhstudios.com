/**
 * s15-08 — a plotted result made small enough to save. The model is asked for 4 decimal places but may answer with
 * full doubles, and 4 series of 400 full-precision points run past the save routes' 64 KB body limit
 * (`CALC_GRAPH_MAX_BODY_BYTES`). Six significant digits is finer than any pixel the plot can draw, and keeps the
 * largest result the schema allows near half that limit. Pure and client-safe.
 */
import type { GraphResult } from '@/lib/rmhcalculator/types';

export const GRAPH_SAVE_SIGNIFICANT_DIGITS = 6;

const round = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(GRAPH_SAVE_SIGNIFICANT_DIGITS)) : v);

/** The same result with every point rounded to six significant digits; the view, ticks and notes are unchanged. */
export function compactGraphResult(result: GraphResult): GraphResult {
  return {
    ...result,
    series: result.series.map((s) => ({
      ...s,
      points: s.points.map(([x, y]): [number, number | null] => [round(x), y === null ? null : round(y)]),
    })),
  };
}
