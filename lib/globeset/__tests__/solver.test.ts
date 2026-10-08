/**
 * The GlobeSet solver, checked against brute force.
 *
 * Everything the game claims rests on two mathematical facts, so both are
 * asserted here rather than trusted: **any seven cards contain a GlobeSet**
 * (pigeonhole over GF(2)^6), and **a full deck always clears** (all 63 masks
 * XOR to zero, and removing a GlobeSet preserves that).
 *
 * The oracle is deliberately dumb: enumerate all 2^n subsets and keep the ones
 * that XOR to zero. It is exponential and it is obviously correct, which is
 * exactly what a Gaussian-elimination implementation wants checking against —
 * an elimination bug produces a *plausible* wrong answer, which only a second,
 * independent derivation catches.
 */

import { describe, it, expect } from 'vitest';
import {
  DECK_SIZE,
  BOARD_SIZE,
  fullDeck,
  isGlobeSet,
  xorAll,
  dotCount,
  dotsOf,
  colorParity,
  isCard,
  DOT_COLORS,
  type Card,
} from '@/lib/globeset/cards';
import {
  eliminate,
  findGlobeSet,
  findSmallestGlobeSet,
  allGlobeSets,
  countGlobeSets,
  rankOf,
  popcount,
  indicesOf,
  maskOf,
  selectionIsViable,
  solveOut,
} from '@/lib/globeset/solver';
import { dealFromSeed, dealForDate } from '@/lib/globeset/game';

/** Brute-force oracle: every non-empty subset whose cards XOR to zero. */
function bruteForceGlobeSets(cards: readonly Card[]): number[][] {
  const out: number[][] = [];
  for (let combo = 1; combo < 1 << cards.length; combo++) {
    const indices = indicesOf(combo);
    if (xorAll(indices.map((i) => cards[i])) === 0) out.push(indices);
  }
  return out.sort((a, b) => a.length - b.length || a[0] - b[0]);
}

/** A deterministic PRNG so a failure is reproducible from the seed alone. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** `n` distinct cards drawn from the deck. */
function randomBoard(random: () => number, n: number): Card[] {
  const deck = fullDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, n);
}

describe('the deck', () => {
  it('is every non-empty six-dot subset, exactly once', () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    expect(new Set(deck).size).toBe(DECK_SIZE);
    expect(Math.min(...deck)).toBe(1);
    expect(Math.max(...deck)).toBe(DECK_SIZE);
  });

  it('XORs to zero — which is why a run can always be cleared', () => {
    expect(xorAll(fullDeck())).toBe(0);
  });

  it('describes its own dots', () => {
    expect(DOT_COLORS).toHaveLength(6);
    expect(new Set(DOT_COLORS.map((c) => c.bit)).size).toBe(6);
    expect(new Set(DOT_COLORS.map((c) => c.id)).size).toBe(6);
    expect(new Set(DOT_COLORS.map((c) => c.shape)).size).toBe(6);
    for (const card of fullDeck()) {
      expect(dotsOf(card).length).toBe(dotCount(card));
      expect(dotCount(card)).toBeGreaterThan(0);
    }
  });

  it('rejects non-cards', () => {
    for (const bad of [0, -1, 64, 1.5, NaN, '3', null, undefined]) {
      expect(isCard(bad)).toBe(false);
    }
    expect(isCard(1)).toBe(true);
    expect(isCard(63)).toBe(true);
  });
});

describe('isGlobeSet', () => {
  it('accepts a set whose colours all pair up', () => {
    // {red}, {orange}, {red, orange} → every colour twice.
    expect(isGlobeSet([0b000001, 0b000010, 0b000011])).toBe(true);
  });

  it('rejects the empty selection', () => {
    expect(isGlobeSet([])).toBe(false);
  });

  it('rejects a repeated card, even though the XOR is zero', () => {
    expect(xorAll([0b000101, 0b000101])).toBe(0);
    expect(isGlobeSet([0b000101, 0b000101])).toBe(false);
  });

  it('has no GlobeSet smaller than three cards', () => {
    const deck = fullDeck();
    for (const a of deck) {
      expect(isGlobeSet([a])).toBe(false);
      for (const b of deck) if (a !== b) expect(isGlobeSet([a, b])).toBe(false);
    }
  });

  it('reports which colours are still unpaired', () => {
    expect(colorParity([])).toEqual([false, false, false, false, false, false]);
    expect(colorParity([0b000001])).toEqual([true, false, false, false, false, false]);
    expect(colorParity([0b000001, 0b000010, 0b000011])).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('bit helpers', () => {
  it('round-trips indices through a mask', () => {
    for (const indices of [[], [0], [0, 3, 7], [1, 2, 3, 4, 5, 6]]) {
      expect(indicesOf(maskOf(indices))).toEqual(indices);
      expect(popcount(maskOf(indices))).toBe(indices.length);
    }
  });
});

describe('Gaussian elimination over GF(2)', () => {
  it('produces an echelon basis with distinct pivots', () => {
    const random = rng(7);
    for (let trial = 0; trial < 300; trial++) {
      const board = randomBoard(random, 1 + Math.floor(random() * 10));
      const { basis } = eliminate(board);
      const pivots = basis.map((row) => row.pivot);
      expect(new Set(pivots).size).toBe(pivots.length);
      for (const row of basis) {
        // A row's pivot really is its highest set bit.
        expect(row.vector >> row.pivot).toBe(1);
      }
    }
  });

  it('carries provenance that actually reproduces each row', () => {
    const random = rng(11);
    for (let trial = 0; trial < 300; trial++) {
      const board = randomBoard(random, 1 + Math.floor(random() * 12));
      const { basis, nullSpace } = eliminate(board);
      for (const row of basis) {
        expect(xorAll(indicesOf(row.provenance).map((i) => board[i]))).toBe(row.vector);
      }
      for (const dependency of nullSpace) {
        expect(dependency).not.toBe(0);
        expect(xorAll(indicesOf(dependency).map((i) => board[i]))).toBe(0);
      }
    }
  });

  it('agrees with brute force on rank and on the GlobeSet count', () => {
    const random = rng(13);
    for (let trial = 0; trial < 400; trial++) {
      const n = 1 + Math.floor(random() * 12);
      const board = randomBoard(random, n);
      const expected = bruteForceGlobeSets(board);
      expect(countGlobeSets(board)).toBe(expected.length);
      // rank = n − dim(null space), and dim = log2(count + 1).
      expect(rankOf(board)).toBe(n - Math.log2(expected.length + 1));
    }
  });

  it('refuses input wider than the provenance mask', () => {
    expect(() => eliminate(fullDeck())).toThrow(RangeError);
  });
});

describe('finding GlobeSets', () => {
  it('returns a genuine GlobeSet whenever one exists', () => {
    const random = rng(17);
    for (let trial = 0; trial < 1000; trial++) {
      const board = randomBoard(random, 1 + Math.floor(random() * 12));
      const found = findGlobeSet(board);
      if (found === null) {
        expect(bruteForceGlobeSets(board)).toHaveLength(0);
      } else {
        expect(isGlobeSet(found.map((i) => board[i]))).toBe(true);
      }
    }
  });

  it('enumerates exactly the GlobeSets brute force finds', () => {
    const random = rng(19);
    for (let trial = 0; trial < 250; trial++) {
      const board = randomBoard(random, 1 + Math.floor(random() * 11));
      const mine = allGlobeSets(board).map((s) => s.join(','));
      const theirs = bruteForceGlobeSets(board).map((s) => s.join(','));
      expect([...mine].sort()).toEqual([...theirs].sort());
    }
  });

  it('returns them smallest first, and the hint takes the smallest', () => {
    const random = rng(23);
    for (let trial = 0; trial < 300; trial++) {
      const board = randomBoard(random, BOARD_SIZE);
      const all = allGlobeSets(board);
      expect(all.length).toBeGreaterThan(0);
      for (let i = 1; i < all.length; i++) {
        expect(all[i].length).toBeGreaterThanOrEqual(all[i - 1].length);
      }
      const smallest = findSmallestGlobeSet(board);
      expect(smallest).toEqual(all[0]);
      expect(smallest!.length).toBe(Math.min(...all.map((s) => s.length)));
    }
  });

  it('never finds a GlobeSet on a board that has none', () => {
    // Six independent vectors — a basis — span everything and cancel nothing.
    const basis = [0b000001, 0b000010, 0b000100, 0b001000, 0b010000, 0b100000];
    expect(countGlobeSets(basis)).toBe(0);
    expect(findGlobeSet(basis)).toBeNull();
    expect(findSmallestGlobeSet(basis)).toBeNull();
    expect(allGlobeSets(basis)).toEqual([]);
  });
});

describe('the seven-card guarantee', () => {
  it('holds for a large random sample', () => {
    const random = rng(29);
    for (let trial = 0; trial < 5000; trial++) {
      const board = randomBoard(random, BOARD_SIZE);
      const found = findGlobeSet(board);
      expect(found).not.toBeNull();
      expect(isGlobeSet(found!.map((i) => board[i]))).toBe(true);
    }
  });

  it('holds for every board a real deal ever shows', () => {
    // Walk 40 daily deals, taking the smallest GlobeSet each time — every board
    // the player would actually be shown, checked for the guarantee.
    for (let seed = 0; seed < 40; seed++) {
      const deck = dealFromSeed(seed);
      let board = deck.slice(0, BOARD_SIZE);
      let next = BOARD_SIZE;
      while (board.length > 0) {
        if (board.length === BOARD_SIZE) expect(countGlobeSets(board)).toBeGreaterThan(0);
        const step = findSmallestGlobeSet(board);
        expect(step).not.toBeNull();
        const taken = new Set(step!);
        board = board.filter((_, i) => !taken.has(i));
        while (board.length < BOARD_SIZE && next < deck.length) board.push(deck[next++]);
      }
    }
  });
});

describe('selectionIsViable', () => {
  it('agrees with brute force about whether a pick can still complete', () => {
    const random = rng(31);
    for (let trial = 0; trial < 400; trial++) {
      const board = randomBoard(random, BOARD_SIZE);
      const pickMask = Math.floor(random() * (1 << BOARD_SIZE));
      const selected = indicesOf(pickMask);
      if (selected.length === 0) continue; // the empty pick has its own case below
      const expected = bruteForceGlobeSets(board).some((set) =>
        selected.every((i) => set.includes(i)),
      );
      expect(selectionIsViable(board, selected)).toBe(expected);
    }
  });

  it('calls an already-complete selection viable', () => {
    const board = [0b000001, 0b000010, 0b000011, 0b000100, 0b001000, 0b010000, 0b100000];
    expect(selectionIsViable(board, [0, 1, 2])).toBe(true);
  });

  it('calls the empty selection non-viable — nothing has been picked yet', () => {
    const board = randomBoard(rng(37), BOARD_SIZE);
    expect(selectionIsViable(board, [])).toBe(false);
  });
});

describe('solveOut', () => {
  it('clears a full deck, from every deal it is given', () => {
    for (let seed = 0; seed < 60; seed++) {
      const deck = dealFromSeed(seed);
      const steps = solveOut(deck.slice(0, BOARD_SIZE), deck.slice(BOARD_SIZE), BOARD_SIZE);
      const taken = steps.flatMap((s) => s.cards);
      expect(new Set(taken).size).toBe(DECK_SIZE);
      expect(taken).toHaveLength(DECK_SIZE);
      for (const step of steps) expect(isGlobeSet(step.cards)).toBe(true);
    }
  });

  it('clears the real daily deal too', () => {
    const deck = dealForDate('2026-09-20');
    const steps = solveOut(deck.slice(0, BOARD_SIZE), deck.slice(BOARD_SIZE), BOARD_SIZE);
    expect(steps.flatMap((s) => s.cards)).toHaveLength(DECK_SIZE);
  });

  it('stops rather than spinning on a board it cannot finish', () => {
    // A basis has no GlobeSet at all: solveOut must return empty, not hang.
    const stuck = [0b000001, 0b000010, 0b000100, 0b001000, 0b010000, 0b100000];
    expect(solveOut(stuck, [], BOARD_SIZE)).toEqual([]);
  });
});
