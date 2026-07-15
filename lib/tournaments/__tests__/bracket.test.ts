import { describe, it, expect } from 'vitest';
import {
  standardSeedPositions,
  generateSingleElim,
  generateRoundRobin,
} from '../bracket';

describe('standardSeedPositions', () => {
  it('produces the classic seeding order', () => {
    expect(standardSeedPositions(2)).toEqual([1, 2]);
    expect(standardSeedPositions(4)).toEqual([1, 4, 2, 3]);
    expect(standardSeedPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

describe('generateSingleElim', () => {
  it('builds a full bracket for a power-of-two field', () => {
    const b = generateSingleElim(['a', 'b', 'c', 'd']); // seeds 1..4
    expect(b.rounds).toBe(2);
    // 2 semifinals + 1 final
    expect(b.matches).toHaveLength(3);
    const r1 = b.matches.filter((m) => m.round === 1);
    expect(r1).toHaveLength(2);
    // Top seed (a) meets the bottom seed (d) in slot 0; both slots filled → READY.
    expect(r1[0].entrantAId).toBe('a');
    expect(r1[0].entrantBId).toBe('d');
    expect(r1[0].state).toBe('READY');
    // Winners flow into the final (round 2, slot 0).
    expect(r1[0].nextKey).toBe('2:0');
    expect(r1[0].nextSlot).toBe(0);
    expect(r1[1].nextSlot).toBe(1);
    const final = b.matches.find((m) => m.round === 2);
    expect(final?.nextKey).toBeNull();
    expect(final?.state).toBe('PENDING');
  });

  it('gives top seeds byes when the field is not a power of two', () => {
    const b = generateSingleElim(['a', 'b', 'c']); // 3 players → size 4
    const r1 = b.matches.filter((m) => m.round === 1);
    // One match is a real pairing, one is a bye (a single entrant).
    const byes = r1.filter((m) => m.state === 'BYE');
    expect(byes).toHaveLength(1);
    const bye = byes[0];
    // A bye has exactly one entrant present.
    expect(Number(!!bye.entrantAId) + Number(!!bye.entrantBId)).toBe(1);
  });

  it('returns an empty bracket for fewer than two entrants', () => {
    expect(generateSingleElim(['solo']).matches).toHaveLength(0);
  });
});

describe('generateRoundRobin', () => {
  it('pairs every entrant exactly once', () => {
    const b = generateRoundRobin(['a', 'b', 'c', 'd']);
    // n*(n-1)/2 = 6 matches for 4 players.
    expect(b.matches).toHaveLength(6);
    const pairs = b.matches.map((m) => [m.entrantAId, m.entrantBId].sort().join('-'));
    expect(new Set(pairs).size).toBe(6); // no duplicate pairings
    expect(b.matches.every((m) => m.state === 'READY')).toBe(true);
  });
});
