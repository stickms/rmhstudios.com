import { describe, expect, it } from 'vitest';
import { splitBill, splitCents } from '@/lib/toolbox/split-bill';

const people = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, weight: 1 }));

describe('splitCents', () => {
  it('always adds up to the total', () => {
    expect(splitCents(10000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
    expect(splitCents(10000, [1, 1, 1, 1, 1])).toEqual([2000, 2000, 2000, 2000, 2000]);
    expect(splitCents(1, [1, 1])).toEqual([1, 0]);
    for (let total = 0; total < 500; total += 7) {
      const s = splitCents(total, [3, 1, 2.5, 0.5]);
      expect(s.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('follows the weights', () => {
    expect(splitCents(9000, [2, 1])).toEqual([6000, 3000]);
    expect(splitCents(100, [0, 0])).toEqual([0, 0]);
  });
});

describe('splitBill', () => {
  it('adds tax, then tip on the pre-tax amount', () => {
    const r = splitBill({ subtotal: 80, taxPercent: 10, tipPercent: 20, tipOn: 'pre-tax', people: people(4), roundUpTo: 0 });
    expect(r).toEqual({
      tax: 8,
      tip: 16,
      total: 104,
      shares: [
        { name: 'P1', amount: 26 },
        { name: 'P2', amount: 26 },
        { name: 'P3', amount: 26 },
        { name: 'P4', amount: 26 },
      ],
      surplus: 0,
    });
  });

  it('can tip on the amount after tax', () => {
    expect(splitBill({ subtotal: 100, taxPercent: 10, tipPercent: 10, tipOn: 'post-tax', people: people(1), roundUpTo: 0 }).tip).toBe(11);
  });

  it('rounds shares up for cash and reports the surplus', () => {
    const r = splitBill({ subtotal: 100, taxPercent: 0, tipPercent: 0, tipOn: 'pre-tax', people: people(3), roundUpTo: 100 });
    expect(r.shares.map((s) => s.amount)).toEqual([34, 34, 34]);
    expect(r.surplus).toBe(2);
  });

  it('splits by weight', () => {
    const r = splitBill({
      subtotal: 90,
      taxPercent: 0,
      tipPercent: 0,
      tipOn: 'pre-tax',
      people: [
        { name: 'Two shares', weight: 2 },
        { name: 'One share', weight: 1 },
      ],
      roundUpTo: 0,
    });
    expect(r.shares.map((s) => s.amount)).toEqual([60, 30]);
  });
});
