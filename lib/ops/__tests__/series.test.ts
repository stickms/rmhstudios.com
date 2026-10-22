import { describe, expect, it } from 'vitest';
import { effectiveRules, type SeriesRow } from '../alarm-rules';
import { bucketFor, buildSeries, chartSpecs } from '../series';

// The graphs on /admin/alarms must show the same numbers the alarms judge.

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const row = (minsAgo: number, over: Partial<SeriesRow>): SeriesRow => ({
  at: new Date(NOW - minsAgo * MIN),
  metric: 'http.latency',
  dim: 'ssr',
  count: 10,
  p50: null,
  p95: null,
  p99: null,
  value: null,
  ...over,
});

describe('chartSpecs', () => {
  it('one chart per metric|dim|stat, carrying every rule that watches it', () => {
    const specs = chartSpecs(effectiveRules([]));
    const fiveXX = specs.find((s) => s.key === 'http.5xx_pct|ssr|value')!;
    expect(fiveXX.rules.map((r) => r.forMinutes).sort()).toEqual([10, 3]);
    expect(new Set(specs.map((s) => s.key)).size).toBe(specs.length);
  });
});

describe('buildSeries', () => {
  it('weights by sample count within a bucket, like the alarm evaluation', () => {
    // An old row makes the history span the whole day, so 24h uses 15-min buckets.
    const rows = [
      row(23 * 60, { p95: 500, count: 1 }),
      row(30, { p95: 1000, count: 30 }),
      row(29, { p95: 4000, count: 10 }),
    ];
    const s = buildSeries(effectiveRules([]), rows, '24h', NOW).find(
      (x) => x.key === 'http.latency|ssr|p95',
    )!;
    expect(s.points.at(-1)).toEqual({
      t: Math.floor((NOW - 30 * MIN) / (15 * MIN)) * 15 * MIN,
      v: 1750,
    });
    expect(s.thresholds).toEqual([{ value: 2500, label: 'A09 · 10 min', muted: false }]);
  });

  it("dim '*' charts the worst dimension per point", () => {
    const rows = [
      row(5, { metric: 'process.heap_pct', dim: 'web', value: 60, count: 0 }),
      row(5, { metric: 'process.heap_pct', dim: 'jobs', value: 88, count: 0 }),
    ];
    const s = buildSeries(effectiveRules([]), rows, '1h', NOW).find(
      (x) => x.metric === 'process.heap_pct',
    )!;
    expect(s).toMatchObject({ worstOf: true, points: [{ v: 88 }] });
  });

  it('drops rows outside the range and shows overridden thresholds', () => {
    const rules = effectiveRules([
      {
        key: 'A09|http.latency|ssr|p95|10m',
        threshold: 3000,
        muted: false,
        updatedBy: 'u',
        updatedAt: new Date(),
      },
    ]);
    const s = buildSeries(rules, [row(90, { p95: 9 })], '1h', NOW).find(
      (x) => x.key === 'http.latency|ssr|p95',
    )!;
    expect(s.points).toEqual([]);
    expect(s.thresholds[0]!.value).toBe(3000);
  });
});

describe('bucketFor', () => {
  it('uses the range bucket for a full history, and finer buckets for a young one', () => {
    const full = [row(23 * 60, {}), row(1, {})];
    expect(bucketFor('24h', full, NOW)).toBe(15 * MIN);
    // 20 minutes of history on the 24h view: 1-minute points, so it still draws.
    expect(bucketFor('24h', [row(20, {}), row(1, {})], NOW)).toBe(MIN);
    // 3 hours on the 7-day view: 15-minute points (12 of them).
    expect(bucketFor('7d', [row(180, {}), row(1, {})], NOW)).toBe(15 * MIN);
    expect(bucketFor('1h', [], NOW)).toBe(MIN);
  });
});
