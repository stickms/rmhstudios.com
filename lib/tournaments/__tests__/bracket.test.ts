import { describe, it, expect } from 'vitest';
import {
  standardSeedPositions,
  generateSingleElim,
  generateRoundRobin,
  resolveBracketRows,
  type BracketMatch,
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

describe('resolveBracketRows', () => {
  // Mirrors the persistence path that this function replaced: insert each match
  // to learn its id, then walk the bracket again wiring nextKey -> that id.
  // Any divergence from this reference means the bulk-insert rewrite changed
  // the shape of a persisted bracket.
  function referenceTwoPass(matches: BracketMatch[], ids: string[]) {
    const keyToId = new Map<string, string>();
    matches.forEach((m, i) => keyToId.set(`${m.round}:${m.slot}`, ids[i]));
    return matches.map((m, i) => {
      const id = keyToId.get(`${m.round}:${m.slot}`);
      const nextId = m.nextKey ? keyToId.get(m.nextKey) : undefined;
      const wired = !!(m.nextKey && id && nextId);
      return {
        id: ids[i],
        round: m.round,
        slot: m.slot,
        entrantAId: m.entrantAId,
        entrantBId: m.entrantBId,
        state: m.state,
        nextMatchId: wired ? (nextId as string) : null,
        nextSlot: wired ? m.nextSlot : null,
      };
    });
  }

  const seqIds = () => {
    let n = 0;
    return () => `m${n++}`;
  };

  it('matches the previous insert-then-wire behaviour for single elimination', () => {
    for (const size of [2, 3, 4, 5, 8, 13, 16, 33, 64]) {
      const entrants = Array.from({ length: size }, (_, i) => `e${i}`);
      const b = generateSingleElim(entrants);
      const ids = b.matches.map((_, i) => `m${i}`);
      expect(resolveBracketRows(b.matches, seqIds())).toEqual(referenceTwoPass(b.matches, ids));
    }
  });

  it('matches the previous behaviour for round robin (no next links)', () => {
    for (const size of [2, 5, 12, 64]) {
      const entrants = Array.from({ length: size }, (_, i) => `e${i}`);
      const b = generateRoundRobin(entrants);
      const ids = b.matches.map((_, i) => `m${i}`);
      const rows = resolveBracketRows(b.matches, seqIds());
      expect(rows).toEqual(referenceTwoPass(b.matches, ids));
      expect(rows.every((r) => r.nextMatchId === null && r.nextSlot === null)).toBe(true);
    }
  });

  it('wires every winner path to a real match id', () => {
    const b = generateSingleElim(Array.from({ length: 16 }, (_, i) => `e${i}`));
    const rows = resolveBracketRows(b.matches, seqIds());
    const byId = new Map(rows.map((r) => [r.id, r]));

    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length); // ids distinct

    for (const row of rows) {
      if (row.nextMatchId === null) continue;
      const target = byId.get(row.nextMatchId);
      expect(target).toBeDefined();
      // The winner always advances to a strictly later round.
      expect(target!.round).toBe(row.round + 1);
      expect(row.nextSlot === 0 || row.nextSlot === 1).toBe(true);
    }

    // Exactly one match (the final) terminates the bracket.
    expect(rows.filter((r) => r.nextMatchId === null)).toHaveLength(1);
  });

  it('scales to the 64-player round-robin cap', () => {
    const b = generateRoundRobin(Array.from({ length: 64 }, (_, i) => `e${i}`));
    expect(b.matches).toHaveLength((64 * 63) / 2); // 2016
    const rows = resolveBracketRows(b.matches, seqIds());
    expect(rows).toHaveLength(2016);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2016);
  });
});
