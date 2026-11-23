import { describe, expect, it } from 'vitest';
import { forecastCycle, type ForecastInput, type ForecastResult, type HistoryCycle } from './forecast';
import { scale, triangleCycle } from './fixtures';
import { cumulativeAt, seasonTotal, shareAt, type DayCount } from './shares';

const END = 364;
const shape = { startDay: 30, peakDay: 150, endDay: 330 };
const A = triangleCycle({ total: 200, ...shape });
const B = triangleCycle({ total: 100, ...shape });
const Cc = triangleCycle({ total: 8, ...shape });
const hist = (days: DayCount[], cycleYear: number): HistoryCycle => ({ cycleYear, source: 'CYCLETRACK', days });
const history = [hist(A, 2026), hist(B, 2025), hist(Cc, 2024)];

/** The current season: history A's first `asOfDay` days, scaled so the cumulative count is `target`. */
function currentTo(asOfDay: number, target: number): DayCount[] {
  const days = A.filter((d) => d.day <= asOfDay);
  return scale(days, target / cumulativeAt(days, asOfDay));
}
const input = (over: Partial<ForecastInput> = {}): ForecastInput => ({
  current: currentTo(110, 80),
  asOfDay: 110,
  endDay: END,
  history,
  seed: 1,
  ...over,
});

function numbers(r: ForecastResult): number[] {
  return [
    r.observed,
    r.meanShare ?? 0,
    ...r.basis.flatMap((b) => [b.weight, b.total, b.shareAtAsOf, b.impliedTotal ?? 0]),
    ...r.band.flatMap((b) => [b.day, b.p10, b.p50, b.p90]),
    ...(r.total ? [r.total.p10, r.total.p50, r.total.p90] : []),
    ...(r.halfDay ? [r.halfDay.p10, r.halfDay.p50, r.halfDay.p90] : []),
  ];
}
const finite = (r: ForecastResult) => numbers(r).every((n) => Number.isFinite(n));

describe('forecastCycle', () => {
  it('FULL mode: exact weights and implied totals', () => {
    const r = forecastCycle(input());
    expect(r.mode).toBe('FULL');
    expect(r.basis).toHaveLength(2);
    const [a, b] = r.basis;
    // The 8-event cycle is unusable, so only two cycles count: weights 2/3 and 1/3.
    expect(r.basis.map((x) => x.cycleYear)).toEqual([2026, 2025]);
    expect(a?.weight).toBeCloseTo(2 / 3, 12);
    expect(b?.weight).toBeCloseTo(1 / 3, 12);
    expect(r.observed).toBe(cumulativeAt(currentTo(110, 80), 110));
    expect(a?.impliedTotal).toBeCloseTo(r.observed / shareAt(A, 110), 9);
    const mixed = (2 / 3) * (a?.impliedTotal ?? 0) + (1 / 3) * (b?.impliedTotal ?? 0);
    expect(Math.abs((r.total?.p50 ?? 0) - mixed) / mixed).toBeLessThan(0.03);
  });

  it('band invariants hold at every point', () => {
    const r = forecastCycle(input());
    expect(r.band[0]).toMatchObject({ day: 110, p10: r.observed, p50: r.observed, p90: r.observed });
    expect(r.band[r.band.length - 1]?.day).toBe(END);
    let prev = r.band[0];
    for (const p of r.band) {
      expect(p.p10).toBeLessThanOrEqual(p.p50);
      expect(p.p50).toBeLessThanOrEqual(p.p90);
      expect(p.p10).toBeGreaterThanOrEqual(r.observed);
      expect(p.p10).toBeGreaterThanOrEqual(prev?.p10 ?? 0);
      expect(p.p50).toBeGreaterThanOrEqual(prev?.p50 ?? 0);
      expect(p.p90).toBeGreaterThanOrEqual(prev?.p90 ?? 0);
      prev = p;
    }
    expect(finite(r)).toBe(true);
  });

  it('is deterministic for a seed and stable across seeds', () => {
    const a = forecastCycle(input({ seed: 1 }));
    expect(forecastCycle(input({ seed: 1 }))).toEqual(a);
    const b = forecastCycle(input({ seed: 2 }));
    expect(b).not.toEqual(a);
    expect(Math.abs((b.total?.p50 ?? 0) - (a.total?.p50 ?? 0)) / (a.total?.p50 ?? 1)).toBeLessThan(0.05);
  });

  it('more share, narrower band', () => {
    const lo = forecastCycle(input({ current: currentTo(80, 20), asOfDay: 80 }));
    const hi = forecastCycle(input({ current: currentTo(150, 100), asOfDay: 150 }));
    expect(lo.mode).toBe('FULL');
    const width = (r: ForecastResult) => (r.total?.p90 ?? 0) - (r.total?.p10 ?? 0);
    expect(width(hi)).toBeLessThan(width(lo));
  });

  it('EARLY mode: wide bands, no division by zero', () => {
    const early = forecastCycle(input({ current: currentTo(45, 3), asOfDay: 45 }));
    expect(shareAt(A, 45)).toBeLessThan(0.05);
    expect(early.mode).toBe('EARLY');
    const med = (early.basis[0]?.total ?? 0) * (2 / 3) + (early.basis[1]?.total ?? 0) * (1 / 3);
    expect(Math.abs((early.total?.p50 ?? 0) - 200) / 200).toBeLessThan(0.1);
    expect(med).toBeGreaterThan(0);
    // A matched FULL scenario (same history, more data) is narrower relative to its median.
    const full = forecastCycle(input());
    const rel = (r: ForecastResult) => ((r.total?.p90 ?? 0) - (r.total?.p10 ?? 0)) / (r.total?.p50 ?? 1);
    expect(rel(early)).toBeGreaterThan(1.4 * rel(full));
    const zero = forecastCycle(input({ current: [], asOfDay: 20 }));
    expect(zero.mode).toBe('EARLY');
    expect(zero.observed).toBe(0);
    expect(finite(zero)).toBe(true);
  });

  it('NONE without usable history', () => {
    for (const h of [[], [hist(Cc, 2025)]]) {
      const r = forecastCycle(input({ history: h }));
      expect(r.mode).toBe('NONE');
      expect(r.band).toEqual([]);
      expect(r.total).toBeNull();
      expect(r.basis).toEqual([]);
    }
  });

  it('a single history cycle is FULL with weight 1', () => {
    const r = forecastCycle(input({ history: [hist(A, 2026)] }));
    expect(r.mode).toBe('FULL');
    expect(r.basis).toHaveLength(1);
    expect(r.basis[0]?.weight).toBe(1);
  });

  it('a cycle with share 0 at asOf has no implied total and never divides', () => {
    const late = triangleCycle({ total: 100, startDay: 200, peakDay: 250, endDay: 330 });
    const r = forecastCycle(input({ history: [hist(late, 2026), hist(A, 2025)] }));
    expect(r.basis[0]).toMatchObject({ cycleYear: 2026, impliedTotal: null, shareAtAsOf: 0, weight: 0 });
    expect(r.basis[1]?.weight).toBe(1);
    expect(finite(r)).toBe(true);
  });

  it('share 1 at asOf everywhere: flat at observed', () => {
    const r = forecastCycle(input({ asOfDay: 340, current: currentTo(110, 80) }));
    expect(finite(r)).toBe(true);
    for (const p of r.band) expect([p.p10, p.p50, p.p90]).toEqual([r.observed, r.observed, r.observed]);
  });

  it('an implied total below the observed count keeps p10 at or above it', () => {
    // History A has a small season; the current count is already above its total.
    const r = forecastCycle(input({ history: [hist(triangleCycle({ total: 12, ...shape }), 2026)] }));
    for (const p of r.band) expect(p.p10).toBeGreaterThanOrEqual(r.observed);
    expect(finite(r)).toBe(true);
  });

  it('asOfDay outside [0, endDay) gives no band and does not throw', () => {
    for (const asOfDay of [END, END + 5, -1]) {
      const r = forecastCycle(input({ asOfDay }));
      expect(r.band).toEqual([]);
      expect(finite(r)).toBe(true);
    }
  });

  it('halfDay is the first observed day to reach half the final total when the season is past half', () => {
    const asOfDay = 200;
    const current = A.filter((d) => d.day <= asOfDay);
    const r = forecastCycle(input({ current, asOfDay, history: [hist(A, 2026)] }));
    expect(shareAt(A, asOfDay)).toBeGreaterThan(0.5);
    const half = seasonTotal(A) / 2;
    const firstDay = A.find((d) => cumulativeAt(A, d.day) >= half)?.day;
    expect(r.halfDay?.p50).toBeLessThanOrEqual(asOfDay);
    expect(Math.abs((r.halfDay?.p50 ?? 0) - (firstDay ?? 0))).toBeLessThanOrEqual(6);
    const early = forecastCycle(input());
    expect(early.halfDay?.p50).toBeGreaterThan(110);
  });
});
