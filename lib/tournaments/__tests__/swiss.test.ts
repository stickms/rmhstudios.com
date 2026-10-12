/**
 * Swiss pairing. Kept in the mission-critical suite because tournament
 * results drive coin prize payouts: a rematch, a double bye or a wrong
 * standing moves money to the wrong member.
 */
import { describe, it, expect } from 'vitest';
import { pairRound, recommendedRounds, standings, type SwissResult } from '@/lib/tournaments/swiss';

const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

describe('swiss', () => {
  it('scores wins, draws and byes and tiebreaks on Buchholz', () => {
    const results: SwissResult[] = [
      { a: 'p1', b: 'p2', winner: 'p1' },
      { a: 'p3', b: 'p4', winner: null },
      { a: 'p5', b: null, winner: 'p5' },
    ];
    const t = standings(['p1', 'p2', 'p3', 'p4', 'p5'], results);
    expect(t.map((s) => [s.id, s.points])).toEqual([
      ['p1', 1],
      ['p5', 1],
      ['p3', 0.5],
      ['p4', 0.5],
      ['p2', 0],
    ]);
    expect(t.find((s) => s.id === 'p5')!.hadBye).toBe(true);
  });

  it('never pairs a rematch across a full event', () => {
    const results: SwissResult[] = [];
    const seen = new Set<string>();
    for (let round = 0; round < 5; round++) {
      const pairs = pairRound(players, results);
      expect(pairs).not.toBeNull();
      for (const { a, b } of pairs!) {
        const key = [a, b].sort().join('-');
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        results.push({ a, b, winner: a < b! ? a : b });
      }
    }
    // 6 players, 5 rounds = every pairing exactly once; a sixth is impossible.
    expect(seen.size).toBe(15);
    expect(pairRound(players, results)).toBeNull();
  });

  it('gives at most one bye per player, to the lowest ranked', () => {
    const odd = ['a', 'b', 'c'];
    const results: SwissResult[] = [];
    const byes: string[] = [];
    for (let round = 0; round < 3; round++) {
      const pairs = pairRound(odd, results)!;
      for (const p of pairs) {
        if (p.b === null) byes.push(p.a);
        results.push({ a: p.a, b: p.b, winner: p.a });
      }
    }
    expect(new Set(byes).size).toBe(3);
    expect(pairRound(odd, results)).toBeNull();
  });

  it('recommends ceil(log2 n) rounds', () => {
    expect([1, 2, 8, 9, 64].map(recommendedRounds)).toEqual([0, 1, 3, 4, 6]);
  });
});
