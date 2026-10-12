/**
 * Watch-party bingo win verification. Kept in the mission-critical suite
 * because a bingo win can pay out coins: the server must re-derive the
 * claimant's card and never accept a client-asserted line.
 */
import { describe, it, expect } from 'vitest';
import { completedLines, makeCard, verifyBingo } from '@/lib/rmhtube/bingo';

const pool = Array.from({ length: 30 }, (_, i) => `event ${i}`);

describe('bingo', () => {
  it('is deterministic per (room, user) and different between users', () => {
    const a1 = makeCard(pool, 'room', 'alice')!;
    const a2 = makeCard(pool, 'room', 'alice')!;
    const b = makeCard(pool, 'room', 'bob')!;
    expect(a1.cells).toEqual(a2.cells);
    expect(a1.cells).not.toEqual(b.cells);
    expect(a1.cells[12]).toBeNull();
    expect(new Set(a1.cells.filter(Boolean)).size).toBe(24);
  });

  it('refuses a pool too small for a card', () => {
    expect(makeCard(pool.slice(0, 23), 'room', 'alice')).toBeNull();
    expect(verifyBingo(pool.slice(0, 23), 'room', 'alice', new Set(pool))).toBe(false);
  });

  it('verifies a line only against the claimant’s own card', () => {
    const card = makeCard(pool, 'room', 'alice')!;
    // Call alice's middle row (the free square is in it).
    const row = [10, 11, 13, 14].map((i) => card.cells[i]!);
    const called = new Set(row);
    expect(completedLines(card, called)).toHaveLength(1);
    expect(verifyBingo(pool, 'room', 'alice', called)).toBe(true);
    // The same calls are not a win for a different card (with overwhelming
    // probability for this seed — asserted, so a change to the shuffle that
    // makes it one shows up here).
    expect(verifyBingo(pool, 'room', 'bob', called)).toBe(false);
    expect(verifyBingo(pool, 'room', 'alice', new Set(row.slice(0, 3)))).toBe(false);
  });
});
