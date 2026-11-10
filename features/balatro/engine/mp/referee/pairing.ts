/**
 * Nemesis pairing for N>2 rotating duels (REF-02, A1 §4.2).
 *
 * Recomputed once per ante. The goal of A1's algorithm — random duels, no
 * pair repeated until every pair has met, a bye for odd counts that never
 * falls on the previous ante's bye — is kept; the construction differs, and
 * this is a logged deviation: A1's "rotate the rest left and pair adjacent
 * entries" is not a 1-factorisation for n ≥ 6 and can repeat a pair before
 * the cycle is exhausted (n = 6: offsets 0 and 2 both pair e–f). Instead:
 *
 * - The alive players are put in a per-match stable order (a seeded
 *   shuffle salted by the runId), plus a BYE slot when the count is odd.
 * - The textbook circle method over that order gives n′−1 disjoint perfect
 *   matchings that together contain every pair exactly once (and, with the
 *   BYE slot, every player's bye exactly once).
 * - Each ante picks uniformly (match RNG) among the rounds with no used
 *   pair, preferring one whose bye is not `lastBye`. With a fixed alive set
 *   this can never fail before the cycle ends, so no pair repeats for n′−1
 *   antes.
 * - When the alive set changes mid-cycle the fixed rounds may all clash; a
 *   bounded backtracking search then looks for any perfect matching that
 *   avoids the used pairs; only if none exists are the used pairs reset
 *   ("the cycle restarts") and a fresh round is chosen.
 *
 * Used pairs are stored as the JSON of the sorted id pair; a bye is stored
 * as the pair `["", id]` so byes rotate too.
 */

import { Rng } from '../rng';
import type { Id } from '../types';

export type Pairing = Record<Id, Id | ''>;

/** The used-pair key for two ids (order-independent). `''` stands for the bye. */
export function pairKey(a: Id | '', b: Id | ''): string {
  return JSON.stringify(a < b ? [a, b] : [b, a]);
}

type Slot = Id | null; // null = the BYE slot
type Round = [Slot, Slot][];

/** The circle method: n′−1 disjoint perfect matchings over an even-length order. */
export function circleRounds(order: readonly Slot[]): Round[] {
  const n = order.length;
  if (n < 2 || n % 2 !== 0) return [];
  const fixed = order[0] as Slot;
  const rest = order.slice(1);
  const rounds: Round[] = [];
  for (let r = 0; r < n - 1; r++) {
    const rot = [...rest.slice(r), ...rest.slice(0, r)];
    const list = [fixed, ...rot];
    const round: Round = [];
    for (let i = 0; i < n / 2; i++) round.push([list[i] as Slot, list[n - 1 - i] as Slot]);
    rounds.push(round);
  }
  return rounds;
}

function slotKey(a: Slot, b: Slot): string {
  return pairKey(a ?? '', b ?? '');
}

function byeOf(round: Round): Id | null {
  for (const [a, b] of round) {
    if (a === null) return b;
    if (b === null) return a;
  }
  return null;
}

const SEARCH_BUDGET = 50_000;

/** Bounded backtracking: any perfect matching of `slots` avoiding `used` (and the bye rule). */
function searchMatching(slots: Slot[], used: Set<string>, avoidBye: Id | null): Round | null {
  let budget = SEARCH_BUDGET;
  const go = (rem: Slot[]): Round | null => {
    if (rem.length === 0) return [];
    if (--budget <= 0) return null;
    const first = rem[0] as Slot;
    for (let j = 1; j < rem.length; j++) {
      const other = rem[j] as Slot;
      if (used.has(slotKey(first, other))) continue;
      if (
        avoidBye !== null &&
        ((first === null && other === avoidBye) || (other === null && first === avoidBye))
      )
        continue;
      const next = rem.filter((_, i) => i !== 0 && i !== j);
      const sub = go(next);
      if (sub) return [[first, other], ...sub];
      if (budget <= 0) return null;
    }
    return null;
  };
  return go(slots);
}

export interface PairingInput {
  /** Alive players, in roster order. */
  alive: readonly Id[];
  usedPairs: readonly string[];
  lastBye: Id | null;
  /** Per-match salt for the stable order (e.g. `hashString(runId)`). */
  salt: number;
}

export interface PairingResult {
  pairing: Pairing;
  usedPairs: string[];
  lastBye: Id | null;
}

/** The per-match stable order of a set of players. */
export function stableOrder(alive: readonly Id[], salt: number): Id[] {
  const sorted = [...alive].sort();
  return Rng.fromSeed(salt).shuffle(sorted);
}

export function computePairing(input: PairingInput, rng: Rng): PairingResult {
  const { alive, lastBye } = input;
  const pairing: Pairing = {};
  if (alive.length === 0) return { pairing, usedPairs: [...input.usedPairs], lastBye };
  if (alive.length === 1) {
    pairing[alive[0] as Id] = '';
    return { pairing, usedPairs: [...input.usedPairs], lastBye: alive[0] as Id };
  }
  const order: Slot[] = stableOrder(alive, input.salt);
  const odd = order.length % 2 === 1;
  if (odd) order.push(null);
  const rounds = circleRounds(order);
  let used = new Set(input.usedPairs);
  const clean = (r: Round) => r.every(([a, b]) => !used.has(slotKey(a, b)));
  const byeOk = (r: Round) => !odd || lastBye === null || byeOf(r) !== lastBye;

  let candidates = rounds.filter((r) => clean(r) && byeOk(r));
  if (candidates.length === 0) candidates = rounds.filter(clean);
  if (candidates.length === 0) {
    const slots: Slot[] = rng.shuffle(alive);
    if (odd) slots.push(null);
    const found =
      searchMatching(slots, used, odd ? lastBye : null) ?? searchMatching(slots, used, null);
    if (found) candidates = [found];
  }
  if (candidates.length === 0) {
    used = new Set();
    candidates = rounds.filter(byeOk);
    if (candidates.length === 0) candidates = rounds;
  }
  const chosen = candidates[rng.int(candidates.length)] as Round;
  const partner = new Map<Id, Id | ''>();
  for (const [a, b] of chosen) {
    if (a !== null) partner.set(a, b ?? '');
    if (b !== null) partner.set(b, a ?? '');
    used.add(slotKey(a, b));
  }
  for (const id of alive) pairing[id] = partner.get(id) ?? '';
  const bye = odd ? byeOf(chosen) : null;
  return { pairing, usedPairs: [...used], lastBye: bye };
}
