/**
 * The GlobeSet solver — Gaussian reduction over the binary finite field.
 *
 * Every question the game asks about a board is the same linear-algebra
 * question over **GF(2)**, because a GlobeSet is a non-empty set of card masks
 * whose XOR is zero, i.e. a non-trivial element of the **null space** of the
 * 6×n matrix whose columns are the board's cards:
 *
 * | question                     | answer                                        |
 * | ---------------------------- | --------------------------------------------- |
 * | Is there a GlobeSet?           | is the null space non-trivial (rank < n)?     |
 * | Give me one                  | any vector that reduces to zero during elimination |
 * | Give me the easiest one      | the minimum-weight vector of the null space   |
 * | How many are there?          | 2^(n − rank) − 1                               |
 * | Show me all of them          | enumerate the null space from its basis       |
 *
 * So there is exactly one routine underneath all of it: {@link eliminate},
 * a row reduction to echelon form over GF(2) that carries **provenance** —
 * alongside each reduced vector it carries a bitmask of which original cards
 * were XOR-ed together to produce it. When a vector reduces to zero, that
 * companion mask *is* a GlobeSet, already named in terms of the player's cards.
 *
 * Arithmetic over GF(2) is XOR and AND, so no pivot ever needs dividing and
 * nothing can lose precision: the elimination is exact integer work on six-bit
 * words, and it is O(n · 6) for the reduction plus O(2^(n − rank)) if the caller
 * asks to enumerate. On a seven-card board that is a few dozen operations —
 * the solver is not the reason anything here is fast or slow.
 *
 * This module is pure: no React, no DOM, no I/O. The auto-solver UI, the hint
 * button, the "GlobeSets available" counter and the multiplayer server's
 * submission check all call into it.
 */

import { COLOR_COUNT, isGlobeSet, type Card } from './cards';

/** One row of the reduced basis: a vector and the cards that produced it. */
export interface BasisRow {
  /** The bit this row pivots on — its highest set bit, unique across the basis. */
  pivot: number;
  /** The reduced vector, in GF(2)^6. */
  vector: number;
  /** Bitmask over the INPUT indices that XOR to {@link vector}. */
  provenance: number;
}

export interface Elimination {
  /** Echelon basis of the span, one row per pivot bit, highest pivot first. */
  basis: BasisRow[];
  /**
   * A basis of the null space, as bitmasks over the input indices. Each entry
   * is a GlobeSet; every GlobeSet is the XOR of a non-empty subset of them.
   */
  nullSpace: number[];
  /** Dimension of the span — `basis.length`. */
  rank: number;
  /** Number of input cards. */
  size: number;
}

/** Population count of a 32-bit word. */
export function popcount(mask: number): number {
  let n = 0;
  let m = mask >>> 0;
  while (m !== 0) {
    m &= m - 1;
    n++;
  }
  return n;
}

/** The set bits of `mask`, ascending — a selection mask back to card indices. */
export function indicesOf(mask: number): number[] {
  const out: number[] = [];
  for (let i = 0; mask >>> i !== 0; i++) if ((mask >>> i) & 1) out.push(i);
  return out;
}

/** Card indices back to a selection mask. */
export function maskOf(indices: readonly number[]): number {
  let mask = 0;
  for (const i of indices) mask |= 1 << i;
  return mask;
}

/**
 * Row-reduce the board to echelon form over GF(2), carrying provenance.
 *
 * Each card is reduced against the pivots already found. If a non-zero pivot
 * bit survives, the reduced vector becomes the pivot row for that bit; if the
 * vector reduces all the way to zero, its provenance mask is a linear
 * dependency — a GlobeSet — and is recorded in `nullSpace`.
 *
 * The dependencies collected this way really are a *basis* of the null space,
 * not merely a sample of it: dependency number *j* is the first one to mention
 * input index *i_j*, and the *i_j* are distinct, so the masks are independent;
 * and there are exactly `size − rank` of them, which is the null space's
 * dimension. That is what lets {@link allGlobeSets} enumerate the whole set from
 * this one pass.
 *
 * Input at most 31 cards, since provenance is a 32-bit mask; a GlobeSet board is
 * seven. Longer input is a programming error rather than player input, so it
 * throws rather than silently truncating.
 */
export function eliminate(cards: readonly Card[]): Elimination {
  if (cards.length > 31) {
    throw new RangeError(`eliminate: ${cards.length} cards exceeds the 31-card provenance mask`);
  }

  // pivots[bit] holds the row whose highest set bit is `bit`, or undefined.
  const pivots: (BasisRow | undefined)[] = new Array(COLOR_COUNT).fill(undefined);
  const nullSpace: number[] = [];

  for (let i = 0; i < cards.length; i++) {
    let vector = cards[i];
    let provenance = 1 << i;
    let placed = false;

    // Scan high bit to low. Every bit above the current one has already been
    // cleared, so the first set bit found is this vector's pivot.
    for (let bit = COLOR_COUNT - 1; bit >= 0; bit--) {
      if (((vector >> bit) & 1) === 0) continue;
      const row = pivots[bit];
      if (row === undefined) {
        pivots[bit] = { pivot: bit, vector, provenance };
        placed = true;
        break;
      }
      vector ^= row.vector;
      provenance ^= row.provenance;
    }

    // Not placed ⇒ the loop ran out of set bits ⇒ the vector reduced to zero.
    // `provenance` still carries bit `i` (no earlier row can clear it), so the
    // dependency is non-empty.
    if (!placed) nullSpace.push(provenance);
  }

  const basis = pivots.filter((row): row is BasisRow => row !== undefined);
  basis.sort((a, b) => b.pivot - a.pivot);

  return { basis, nullSpace, rank: basis.length, size: cards.length };
}

/** Dimension of the span of the board — at most six. */
export function rankOf(cards: readonly Card[]): number {
  return eliminate(cards).rank;
}

/**
 * How many distinct GlobeSets the board contains: `2^(n − rank) − 1`.
 *
 * Every non-zero vector of the null space is one GlobeSet and no two give the
 * same set, so the count is the size of the null space minus its zero vector.
 * Cheap enough to call on every render — it is one elimination and a shift.
 */
export function countGlobeSets(cards: readonly Card[]): number {
  const { size, rank } = eliminate(cards);
  return (1 << (size - rank)) - 1;
}

/**
 * One GlobeSet, as indices into `cards`, or `null` when the board holds none.
 *
 * The first dependency the elimination finds, which is the cheapest possible
 * answer — no enumeration at all. Deterministic for a given board order, so
 * two clients asking the same question get the same answer.
 */
export function findGlobeSet(cards: readonly Card[]): number[] | null {
  const { nullSpace } = eliminate(cards);
  if (nullSpace.length === 0) return null;
  return indicesOf(nullSpace[0]);
}

/**
 * Every GlobeSet on the board, smallest first.
 *
 * Enumerates the null space: each non-empty subset of the `nullSpace` basis
 * XORs to a distinct dependency, giving all `2^(n − rank) − 1` of them. With a
 * seven-card board and rank ≥ 4 that is at most 7 sets; the guard below caps
 * the work anyway, since a caller could hand this a whole deck.
 */
export function allGlobeSets(cards: readonly Card[], limit = 4096): number[][] {
  const { nullSpace } = eliminate(cards);
  const dimension = Math.min(nullSpace.length, 20); // 2^20 is already absurd here
  const found: number[][] = [];

  for (let combo = 1; combo < 1 << dimension; combo++) {
    let mask = 0;
    for (let b = 0; b < dimension; b++) if ((combo >> b) & 1) mask ^= nullSpace[b];
    found.push(indicesOf(mask));
    if (found.length >= limit) break;
  }

  // Smallest first, then lexicographically — a stable, reviewable order that
  // puts the most human-findable GlobeSet at the front.
  found.sort((a, b) => a.length - b.length || compareIndices(a, b));
  return found;
}

function compareIndices(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length && i < b.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/**
 * The smallest GlobeSet on the board — what the hint points at and what the
 * auto-solver plays.
 *
 * Minimum weight is the right choice for both: a three-card GlobeSet is the one
 * a player could plausibly have spotted, so the hint teaches instead of merely
 * rescuing, and the solver's walkthrough reads as a sequence of moves rather
 * than a data dump.
 */
export function findSmallestGlobeSet(cards: readonly Card[]): number[] | null {
  const all = allGlobeSets(cards);
  return all.length > 0 ? all[0] : null;
}

/**
 * Can this partial selection still become a GlobeSet using only board cards?
 *
 * Drives the board's "this is still going somewhere" affordance. The selection
 * completes iff the outstanding parity — the XOR of what is already picked —
 * lies in the span of the cards not yet picked, which is one elimination on the
 * remainder plus one reduction of the target vector.
 */
export function selectionIsViable(board: readonly Card[], selected: readonly number[]): boolean {
  const picked = new Set(selected);
  let target = 0;
  for (const i of selected) target ^= board[i];
  if (target === 0) return picked.size > 0;

  const rest = board.filter((_, i) => !picked.has(i));
  const { basis } = eliminate(rest);
  for (const row of basis) {
    if ((target >> row.pivot) & 1) target ^= row.vector;
  }
  return target === 0;
}

/** One step of the auto-solver: which cards it takes, and what they leave behind. */
export interface SolveStep {
  /** Indices into the board as it stood at the start of this step. */
  indices: number[];
  /** The cards taken, in board order. */
  cards: Card[];
}

/**
 * Play the rest of a run out: repeatedly take the smallest GlobeSet on the board
 * and refill from the deck, exactly as a player would.
 *
 * This is the "I give up" path and the proof that a GlobeSet run can always be
 * finished — it terminates with an empty board for every legal position,
 * because the deck's masks XOR to zero and removing a GlobeSet preserves that,
 * so whatever remains when the deck runs dry is itself a GlobeSet. The loop
 * still carries a hard bound: a malformed board handed in from elsewhere must
 * not be able to spin forever.
 */
export function solveOut(
  board: readonly Card[],
  deck: readonly Card[],
  boardSize: number,
): SolveStep[] {
  const steps: SolveStep[] = [];
  let live = [...board];
  let next = 0;
  const maxSteps = board.length + deck.length + 1;

  while (live.length > 0 && steps.length < maxSteps) {
    const indices = findSmallestGlobeSet(live);
    if (indices === null) break; // unreachable for a legal position; not a crash
    steps.push({ indices, cards: indices.map((i) => live[i]) });

    const taken = new Set(indices);
    live = live.filter((_, i) => !taken.has(i));
    while (live.length < boardSize && next < deck.length) live.push(deck[next++]);
  }

  return steps;
}

/**
 * Re-export so a caller that has the solver imported does not have to reach
 * into `cards.ts` for the one-line check that closes the loop.
 */
export { isGlobeSet };
