import { describe, expect, it } from 'vitest';
import {
  fromCounts,
  LATENCY_BOUNDS_MS,
  LATENCY_BUCKETS,
  mean,
  mergeHistograms,
  newHistogram,
  observe,
  percentile,
} from '../histogram';

describe('histogram', () => {
  it('has one bucket per bound plus +Inf', () => {
    expect(newHistogram().counts).toHaveLength(LATENCY_BUCKETS);
    expect(LATENCY_BUCKETS).toBe(LATENCY_BOUNDS_MS.length + 1);
  });

  it('places values on the right side of each boundary', () => {
    const h = newHistogram();
    observe(h, 1); // <= 1 -> bucket 0
    observe(h, 1.01); // bucket 1 (<= 2)
    observe(h, 30001); // +Inf
    expect(h.counts[0]).toBe(1);
    expect(h.counts[1]).toBe(1);
    expect(h.counts[LATENCY_BUCKETS - 1]).toBe(1);
    expect(h.count).toBe(3);
    expect(h.max).toBe(30001);
  });

  it('ignores negative and NaN values', () => {
    const h = newHistogram();
    observe(h, -5);
    observe(h, Number.NaN);
    expect(h.count).toBe(0);
  });

  it('returns 0 for an empty histogram', () => {
    expect(percentile(newHistogram(), 95)).toBe(0);
    expect(mean(newHistogram())).toBe(0);
  });

  it('interpolates inside a bucket', () => {
    const h = newHistogram();
    // 100 samples spread across the (50, 100] bucket.
    for (let i = 1; i <= 100; i++) observe(h, 50 + i / 2);
    const p50 = percentile(h, 50);
    expect(p50).toBeGreaterThan(50);
    expect(p50).toBeLessThanOrEqual(100);
    expect(p50).toBeCloseTo(75, 0);
    expect(percentile(h, 100)).toBeLessThanOrEqual(h.max);
  });

  it('never reports a percentile above the observed max', () => {
    const h = newHistogram();
    observe(h, 130); // lands in (100, 250]
    expect(percentile(h, 99)).toBeLessThanOrEqual(130);
  });

  it('orders percentiles for a skewed distribution', () => {
    const h = newHistogram();
    for (let i = 0; i < 950; i++) observe(h, 8);
    for (let i = 0; i < 50; i++) observe(h, 800);
    expect(percentile(h, 50)).toBeLessThanOrEqual(10);
    expect(percentile(h, 99)).toBeGreaterThan(250);
    expect(percentile(h, 50)).toBeLessThan(percentile(h, 95));
    expect(percentile(h, 95)).toBeLessThanOrEqual(percentile(h, 99));
  });

  it('merges by adding buckets, so cluster percentiles are not averages', () => {
    const fast = newHistogram();
    const slow = newHistogram();
    for (let i = 0; i < 900; i++) observe(fast, 4);
    for (let i = 0; i < 100; i++) observe(slow, 2000);
    const merged = mergeHistograms(fast, slow);
    expect(merged.count).toBe(1000);
    expect(merged.max).toBe(2000);
    // Averaging the two p95s would land near 1000; the true p95 sits in the slow tail.
    expect(percentile(merged, 95)).toBeGreaterThan(1000);
    // Inputs are untouched.
    expect(fast.count).toBe(900);
  });

  it('rebuilds from bare bucket counts without clamping to an unknown max', () => {
    const h = newHistogram();
    for (let i = 0; i < 10; i++) observe(h, 40);
    const rebuilt = fromCounts(h.counts);
    expect(rebuilt.count).toBe(10);
    expect(percentile(rebuilt, 50)).toBeGreaterThan(25);
    expect(percentile(rebuilt, 50)).toBeLessThanOrEqual(50);
  });
});
