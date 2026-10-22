/**
 * Swiss settlement moves coins: placements come from standings (points, then
 * Buchholz), and the paid amounts plus rake must equal the pool exactly.
 */
import { describe, it, expect } from 'vitest';
import { pairRound } from '@/lib/tournaments/swiss';
import {
  computePayouts,
  resultsFromMatches,
  swissSettlement,
  type SwissMatchRow,
} from '@/lib/tournaments/swiss-flow';

const row = (a: string, b: string | null, winner: string): SwissMatchRow => ({
  entrantAId: a,
  entrantBId: b,
  winnerEntrantId: winner,
  state: 'COMPLETE',
});

/** Play a whole event where the lower seed number always wins. */
function playOut(ids: string[], rounds: number): SwissMatchRow[] {
  const rows: SwissMatchRow[] = [];
  for (let r = 0; r < rounds; r++) {
    const pairs = pairRound(ids, resultsFromMatches(rows));
    if (!pairs) break;
    for (const p of pairs) {
      rows.push(
        p.b === null
          ? row(p.a, null, p.a)
          : row(p.a, p.b, ids.indexOf(p.a) < ids.indexOf(p.b) ? p.a : p.b),
      );
    }
  }
  return rows;
}

describe('computePayouts', () => {
  it('conserves the pool: payouts + rake == pool, remainder to first', () => {
    for (const [pool, bps, n] of [
      [1001, 500, 8],
      [999, 0, 4],
      [12345, 250, 16],
      [7, 500, 2],
    ]) {
      const { payouts, rake } = computePayouts(pool, bps, n);
      expect(payouts.reduce((s, p) => s + p, 0) + rake).toBe(pool);
      expect(payouts.every((p) => p >= 0)).toBe(true);
    }
  });
});

describe('swissSettlement', () => {
  it('pays 1st/2nd/3rd from standings and conserves the pool', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const rows = playOut(ids, 3);
    const out = swissSettlement(ids, rows, 1000, 0);
    expect(out.map((s) => s.placement)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(out[0].entrantId).toBe('a'); // the unbeaten seed
    expect(out.reduce((s, x) => s + x.amount, 0)).toBe(1000);
    expect(out[0].amount).toBeGreaterThan(out[1].amount);
    expect(out[7].amount).toBe(0);
  });

  it('breaks a points tie on Buchholz, not on who finished first', () => {
    // x and y both finish on 1 point; x beat the stronger opponent (p, 2 pts).
    const rows = [row('p', 'q', 'p'), row('p', 'r', 'p'), row('x', 'p', 'x'), row('y', 'q', 'y')];
    const ids = ['y', 'x', 'p', 'q', 'r'];
    const out = swissSettlement(ids, rows, 100, 0);
    const placeOf = (id: string) => out.find((s) => s.entrantId === id)!.placement;
    expect(placeOf('x')).toBeLessThan(placeOf('y'));
  });

  it('counts a bye as a win and pays only entrants in the field', () => {
    const ids = ['a', 'b', 'c'];
    const rows = playOut(ids, 2);
    const out = swissSettlement(ids, rows, 300, 500);
    expect(out).toHaveLength(3);
    const { rake } = computePayouts(300, 500, 3);
    expect(out.reduce((s, x) => s + x.amount, 0) + rake).toBe(300);
  });
});
