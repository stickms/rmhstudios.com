import { describe, it, expect } from 'vitest';
import {
  cost,
  priceYes,
  priceNo,
  costToBuyShares,
  proceedsForShares,
  sharesForBudget,
  pricePercent,
  type Side,
} from '../lmsr';

const B = 120;

describe('lmsr', () => {
  it('starts at 50/50 with no shares outstanding', () => {
    expect(priceYes(0, 0, B)).toBeCloseTo(0.5, 10);
    expect(priceNo(0, 0, B)).toBeCloseTo(0.5, 10);
  });

  it('YES and NO prices always sum to 1', () => {
    for (const [qy, qn] of [
      [10, 3],
      [200, 50],
      [0, 400],
      [999, 1],
    ]) {
      expect(priceYes(qy, qn, B) + priceNo(qy, qn, B)).toBeCloseTo(1, 10);
    }
  });

  it('keeps the price strictly inside (0, 1) for realistic skews', () => {
    // ~600 shares of one-sided flow on a b=120 book is already a lopsided book
    // but stays numerically inside the open interval.
    const p = priceYes(600, 0, B);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });

  it('buying YES raises the YES price', () => {
    const before = priceYes(0, 0, B);
    const after = priceYes(50, 0, B);
    expect(after).toBeGreaterThan(before);
  });

  it('costs more to buy the same shares as a side gets more expensive', () => {
    const cheap = costToBuyShares(0, 0, B, 'YES', 10);
    const pricey = costToBuyShares(200, 0, B, 'YES', 10);
    expect(pricey).toBeGreaterThan(cheap);
    // First shares of a fresh 50/50 market cost roughly half a coin each.
    expect(cheap / 10).toBeGreaterThan(0.4);
    expect(cheap / 10).toBeLessThan(0.6);
  });

  it('sharesForBudget is the inverse of costToBuyShares', () => {
    for (const [qy, qn, budget] of [
      [0, 0, 50],
      [100, 40, 120],
      [0, 300, 25],
      [500, 500, 200],
    ]) {
      const shares = sharesForBudget(qy, qn, B, 'YES', budget);
      const cost = costToBuyShares(qy, qn, B, 'YES', shares);
      expect(cost).toBeCloseTo(budget, 6);
    }
  });

  it('returns 0 shares for a non-positive budget', () => {
    expect(sharesForBudget(0, 0, B, 'YES', 0)).toBe(0);
    expect(sharesForBudget(0, 0, B, 'NO', -5)).toBe(0);
  });

  it('pricePercent is clamped to 1..99', () => {
    expect(pricePercent(0, 0, B)).toBe(50);
    expect(pricePercent(100000, 0, B)).toBe(99);
    expect(pricePercent(0, 100000, B)).toBe(1);
  });

  describe('proceedsForShares', () => {
    /** A small seeded generator so a failure is reproducible. */
    function rng(seed: number) {
      let x = seed >>> 0;
      return () => {
        x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
        return x / 2 ** 32;
      };
    }
    const randomState = (r: () => number) => ({
      qYes: r() * 400,
      qNo: r() * 400,
      b: 20 + r() * 300,
    });
    const side = (r: () => number): Side => (r() < 0.5 ? 'YES' : 'NO');
    const after = (st: { qYes: number; qNo: number }, sd: Side, delta: number) => ({
      qYes: st.qYes + (sd === 'YES' ? delta : 0),
      qNo: st.qNo + (sd === 'NO' ? delta : 0),
    });

    it('is 0 for no shares, negative shares and non-finite shares', () => {
      expect(proceedsForShares(10, 5, B, 'YES', 0)).toBe(0);
      expect(proceedsForShares(10, 5, B, 'YES', -3)).toBe(0);
      expect(proceedsForShares(10, 5, B, 'YES', Number.NaN)).toBe(0);
      expect(proceedsForShares(10, 5, B, 'NO', Number.POSITIVE_INFINITY)).toBe(0);
    });

    it('rounds down to a whole coin and never exceeds the exact difference', () => {
      const r = rng(7);
      for (let i = 0; i < 300; i++) {
        const { qYes, qNo, b } = randomState(r);
        const sd = side(r);
        const shares = r() * 80;
        const exact =
          cost(qYes, qNo, b) - cost(after({ qYes, qNo }, sd, -shares).qYes, after({ qYes, qNo }, sd, -shares).qNo, b);
        const got = proceedsForShares(qYes, qNo, b, sd, shares);
        expect(Number.isInteger(got)).toBe(true);
        expect(got).toBeLessThanOrEqual(exact + 1e-9);
        expect(got).toBeGreaterThan(exact - 1 - 1e-9);
      }
    });

    it('pays nothing for a fraction of a coin', () => {
      expect(proceedsForShares(0, 0, B, 'YES', 0.5)).toBe(0);
    });

    it('buying then selling every share returns at most what was spent', () => {
      const r = rng(11);
      for (let i = 0; i < 400; i++) {
        const st = randomState(r);
        const sd = side(r);
        const spent = 1 + Math.floor(r() * 2000);
        const shares = sharesForBudget(st.qYes, st.qNo, st.b, sd, spent);
        const q = after(st, sd, shares);
        expect(proceedsForShares(q.qYes, q.qNo, st.b, sd, shares)).toBeLessThanOrEqual(spent);
      }
    });

    it('splitting a sale into parts never returns more than selling the whole', () => {
      const r = rng(13);
      for (let i = 0; i < 300; i++) {
        const st = randomState(r);
        const sd = side(r);
        const total = 1 + r() * 150;
        const parts = 2 + Math.floor(r() * 5);
        const whole = proceedsForShares(st.qYes, st.qNo, st.b, sd, total);
        let q = { qYes: st.qYes, qNo: st.qNo };
        let sum = 0;
        for (let k = 0; k < parts; k++) {
          const piece = total / parts;
          sum += proceedsForShares(q.qYes, q.qNo, st.b, sd, piece);
          q = after(q, sd, -piece);
        }
        expect(sum).toBeLessThanOrEqual(whole);
      }
    });

    it("the market's coins always cover its cost function over random buys and partial sells by several members", () => {
      const r = rng(17);
      for (let run = 0; run < 60; run++) {
        const b = 20 + r() * 200;
        const start = { qYes: r() * 50, qNo: r() * 50 };
        let q = { ...start };
        const held = Array.from({ length: 4 }, () => ({ YES: 0, NO: 0 }));
        let taken = 0;
        for (let step = 0; step < 40; step++) {
          const m = Math.floor(r() * held.length);
          const sd = side(r);
          if (r() < 0.55 || held[m]![sd] < 1e-6) {
            const amount = 1 + Math.floor(r() * 300);
            const shares = sharesForBudget(q.qYes, q.qNo, b, sd, amount);
            held[m]![sd] += shares;
            q = after(q, sd, shares);
            taken += amount;
          } else {
            const shares = held[m]![sd] * (r() < 0.3 ? 1 : r());
            const proceeds = proceedsForShares(q.qYes, q.qNo, b, sd, shares);
            held[m]![sd] -= shares;
            q = after(q, sd, -shares);
            taken -= proceeds;
          }
          expect(taken).toBeGreaterThanOrEqual(cost(q.qYes, q.qNo, b) - cost(start.qYes, start.qNo, b) - 1e-6);
        }
      }
    });

    it('then resolution pays out of what it took in, within the b·ln 2 bound plus per-member rounding', () => {
      // resolvePrediction pays Math.round(winning shares) per position; selling lets a member tune a holding,
      // so each position can gain at most half a coin there (README: a recorded, bounded, pre-existing call).
      const r = rng(23);
      const members = 5;
      for (let run = 0; run < 80; run++) {
        const b = 20 + r() * 200;
        let q = { qYes: 0, qNo: 0 };
        const held = Array.from({ length: members }, () => ({ YES: 0, NO: 0 }));
        let taken = 0;
        for (let step = 0; step < 60; step++) {
          const m = Math.floor(r() * members);
          const sd = side(r);
          if (r() < 0.5 || held[m]![sd] < 1e-6) {
            const amount = 1 + Math.floor(r() * 300);
            const shares = sharesForBudget(q.qYes, q.qNo, b, sd, amount);
            held[m]![sd] += shares;
            q = after(q, sd, shares);
            taken += amount;
          } else {
            // Many tiny sales as well as whole ones: the floor is taken per sale.
            const pieces = r() < 0.3 ? 1 + Math.floor(r() * 20) : 1;
            const total = held[m]![sd] * (r() < 0.3 ? 1 : r());
            for (let k = 0; k < pieces; k++) {
              const shares = total / pieces;
              const proceeds = proceedsForShares(q.qYes, q.qNo, b, sd, shares);
              if (proceeds < 1) continue; // the server refuses a sale under one coin
              held[m]![sd] -= shares;
              q = after(q, sd, -shares);
              taken -= proceeds;
            }
          }
        }
        for (const outcome of ['YES', 'NO'] as const) {
          const payout = held.reduce((sum, h) => sum + Math.round(h[outcome]), 0);
          expect(payout - taken).toBeLessThanOrEqual(b * Math.LN2 + 0.5 * members + 1e-6);
        }
      }
    });
  });
});
