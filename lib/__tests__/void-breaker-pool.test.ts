import { describe, it, expect } from 'vitest';
import { acquirePooled, type Pooled } from '@/lib/void-breaker/pool';

interface Slot extends Pooled {
  tag: number;
}

const makePool = (n: number, activeIdx: number[] = []): Slot[] =>
  Array.from({ length: n }, (_, i) => ({ active: activeIdx.includes(i), tag: i }));

/** Reference: the original `pool.find((o) => !o.active)` behaviour. */
const findFirstFree = (pool: Slot[]) => pool.find((s) => !s.active) ?? null;

describe('acquirePooled', () => {
  it('claims the slot at the cursor when it is free', () => {
    const pool = makePool(5);
    const claim = acquirePooled(pool, 2);
    expect(claim?.slot.tag).toBe(2);
    expect(claim?.next).toBe(3);
  });

  it('skips active slots and reports the following cursor', () => {
    const pool = makePool(5, [2, 3]);
    const claim = acquirePooled(pool, 2);
    expect(claim?.slot.tag).toBe(4);
    expect(claim?.next).toBe(0); // wrapped: 4 is the last index
  });

  it('wraps past the end to reach a free slot near the start', () => {
    const pool = makePool(5, [3, 4]);
    const claim = acquirePooled(pool, 3);
    expect(claim?.slot.tag).toBe(0);
    expect(claim?.next).toBe(1);
  });

  it('returns null only when every slot is active', () => {
    const full = makePool(4, [0, 1, 2, 3]);
    expect(acquirePooled(full, 0)).toBeNull();
    expect(acquirePooled(full, 3)).toBeNull();

    const oneFree = makePool(4, [0, 1, 3]);
    expect(acquirePooled(oneFree, 0)?.slot.tag).toBe(2);
    expect(acquirePooled(oneFree, 3)?.slot.tag).toBe(2); // found by wrapping
  });

  it('handles an empty pool', () => {
    expect(acquirePooled([], 0)).toBeNull();
  });

  it('normalizes an out-of-range or negative cursor', () => {
    const pool = makePool(4);
    expect(acquirePooled(pool, 9)?.slot.tag).toBe(1); // 9 % 4
    expect(acquirePooled(pool, -1)?.slot.tag).toBe(3);
    expect(acquirePooled(pool, -6)?.slot.tag).toBe(2);
  });

  it('agrees with the old find-from-zero on whether a slot is available', () => {
    // Slot IDENTITY may differ (that is the point), but availability must not:
    // anything the old scan could satisfy, this must satisfy too.
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

    for (let trial = 0; trial < 300; trial++) {
      const size = 1 + Math.floor(rnd() * 12);
      const active = Array.from({ length: size }, () => rnd() < 0.6);
      const pool: Slot[] = active.map((a, i) => ({ active: a, tag: i }));
      const cursor = Math.floor(rnd() * (size + 3));

      const expected = findFirstFree(pool) !== null;
      const claim = acquirePooled(pool, cursor);
      expect(claim !== null).toBe(expected);
      if (claim) expect(claim.slot.active).toBe(false);
    }
  });

  it('cycles through every free slot before reusing one', () => {
    // The property that makes this worth doing: N acquisitions into an N-slot
    // pool must hand out N distinct slots, never rescanning an active prefix.
    const pool = makePool(6);
    const claimed: number[] = [];
    let cursor = 0;
    for (let i = 0; i < 6; i++) {
      const claim = acquirePooled(pool, cursor);
      expect(claim).not.toBeNull();
      claim!.slot.active = true;
      claimed.push(claim!.slot.tag);
      cursor = claim!.next;
    }
    expect([...claimed].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(acquirePooled(pool, cursor)).toBeNull(); // now genuinely full
  });

  it('reuses a slot freed behind the cursor after wrapping', () => {
    const pool = makePool(3, [0, 1, 2]);
    pool[0].active = false; // freed behind a cursor sitting at 2
    const claim = acquirePooled(pool, 2);
    expect(claim?.slot.tag).toBe(0);
  });
});
