import { describe, expect, it } from 'vitest';
import { compactGraphResult } from '@/lib/rmhcalculator/graph-compact';
import { CALC_GRAPH_MAX_BODY_BYTES, createCalcGraphBody } from '@/lib/rmhcalculator/graphs-schema';
import type { GraphResult } from '@/lib/rmhcalculator/types';

/** The largest result the schema allows, every number a full-precision double. */
function largest(): GraphResult {
  const points = (s: number): [number, number | null][] =>
    Array.from({ length: 400 }, (_, i) => [-10 + (20 * i) / 399 + 1e-13, Math.sin(i + s) * 123.456789012345]);
  return {
    view: { xMin: -10, xMax: 10, yMin: -200, yMax: 200 },
    xTicks: Array.from({ length: 40 }, (_, i) => i - 20),
    yTicks: Array.from({ length: 40 }, (_, i) => i * 10 - 200),
    series: Array.from({ length: 4 }, (_, s) => ({ expression: 'x'.repeat(200), points: points(s) })),
    notes: 'n'.repeat(500),
  };
}
const body = (result: GraphResult) =>
  JSON.stringify({
    title: 't'.repeat(80),
    functions: Array.from({ length: 4 }, () => 'x'.repeat(200)),
    domainMin: -10,
    domainMax: 10,
    result,
  });

describe('compactGraphResult', () => {
  it('brings the largest full-precision result under the save body limit, still valid', () => {
    expect(new TextEncoder().encode(body(largest())).length).toBeGreaterThan(CALC_GRAPH_MAX_BODY_BYTES);
    const compact = body(compactGraphResult(largest()));
    expect(new TextEncoder().encode(compact).length).toBeLessThan(CALC_GRAPH_MAX_BODY_BYTES);
    expect(createCalcGraphBody.safeParse(JSON.parse(compact)).success).toBe(true);
  });

  it('rounds points to six significant digits and keeps breaks, the view and ticks', () => {
    const out = compactGraphResult({
      view: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
      xTicks: [0.123456789],
      yTicks: [],
      series: [
        {
          expression: 'x',
          points: [
            [0.123456789, 1234.56789],
            [1e-13, null],
          ],
        },
      ],
    });
    expect(out.series[0]!.points).toEqual([
      [0.123457, 1234.57],
      [1e-13, null],
    ]);
    expect(out.xTicks).toEqual([0.123456789]);
    expect(out.view).toEqual({ xMin: -1, xMax: 1, yMin: -1, yMax: 1 });
  });
});
