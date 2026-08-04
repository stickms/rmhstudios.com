import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from '@/lib/async-pool';

/** Resolves after `ms`, recording peak concurrency in the shared counter. */
function tracker() {
  const state = { inFlight: 0, peak: 0, order: [] as number[] };
  const run = async (value: number, ms: number) => {
    state.inFlight++;
    state.peak = Math.max(state.peak, state.inFlight);
    await new Promise((r) => setTimeout(r, ms));
    state.order.push(value);
    state.inFlight--;
    return value * 2;
  };
  return { state, run };
}

describe('mapWithConcurrency', () => {
  it('returns results in input order even when items finish out of order', async () => {
    const { state, run } = tracker();
    // Descending delays: later items finish first.
    const items = [0, 1, 2, 3, 4, 5];
    const out = await mapWithConcurrency(items, 6, (n) => run(n, (6 - n) * 5));

    expect(out).toEqual([0, 2, 4, 6, 8, 10]); // input order preserved
    expect(state.order).not.toEqual(items); // completion order genuinely differed
  });

  it('never exceeds the concurrency limit', async () => {
    const { state, run } = tracker();
    await mapWithConcurrency(
      Array.from({ length: 40 }, (_, i) => i),
      5,
      (n) => run(n, 2),
    );
    expect(state.peak).toBeLessThanOrEqual(5);
    expect(state.peak).toBeGreaterThan(1); // it really did overlap
  });

  it('processes every item exactly once', async () => {
    const seen: number[] = [];
    const items = Array.from({ length: 101 }, (_, i) => i);
    await mapWithConcurrency(items, 7, async (n) => {
      seen.push(n);
      return n;
    });
    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });

  it('passes the index alongside the item', async () => {
    const out = await mapWithConcurrency(['a', 'b', 'c'], 2, async (item, i) => `${i}:${item}`);
    expect(out).toEqual(['0:a', '1:b', '2:c']);
  });

  it('returns an empty array for no items without invoking fn', async () => {
    let calls = 0;
    const out = await mapWithConcurrency([], 4, async () => {
      calls++;
      return 1;
    });
    expect(out).toEqual([]);
    expect(calls).toBe(0);
  });

  it('degrades to sequential rather than deadlocking on a non-positive limit', async () => {
    const { state, run } = tracker();
    const out = await mapWithConcurrency([1, 2, 3], 0, (n) => run(n, 1));
    expect(out).toEqual([2, 4, 6]);
    expect(state.peak).toBe(1);
  });

  it('caps workers at the item count for an oversized limit', async () => {
    const { state, run } = tracker();
    await mapWithConcurrency([1, 2], 500, (n) => run(n, 2));
    expect(state.peak).toBeLessThanOrEqual(2);
  });

  it('propagates a rejection', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
  });
});
