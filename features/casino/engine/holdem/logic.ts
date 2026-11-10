/**
 * Texas Hold'em hand evaluation and deck management.
 * Single-deck game — no duplicate cards.
 */

export type Suit = 'H' | 'D' | 'C' | 'S';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

const RANK_ORDER: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  J: 11, Q: 12, K: 13, A: 14,
};

export type HandRank =
  | 'high_card'
  | 'pair'
  | 'two_pair'
  | 'three_of_a_kind'
  | 'straight'
  | 'flush'
  | 'full_house'
  | 'four_of_a_kind'
  | 'straight_flush'
  | 'royal_flush';

const HAND_RANK_VALUE: Record<HandRank, number> = {
  high_card: 0,
  pair: 1,
  two_pair: 2,
  three_of_a_kind: 3,
  straight: 4,
  flush: 5,
  full_house: 6,
  four_of_a_kind: 7,
  straight_flush: 8,
  royal_flush: 9,
};

export const HAND_RANK_LABELS: Record<HandRank, string> = {
  high_card: 'High Card',
  pair: 'Pair',
  two_pair: 'Two Pair',
  three_of_a_kind: 'Three of a Kind',
  straight: 'Straight',
  flush: 'Flush',
  full_house: 'Full House',
  four_of_a_kind: 'Four of a Kind',
  straight_flush: 'Straight Flush',
  royal_flush: 'Royal Flush',
};

export interface EvaluatedHand {
  rank: HandRank;
  values: number[]; // for tie-breaking, highest first
}

/** Create a shuffled single 52-card deck. */
export function createDeck(): Card[] {
  const suits: Suit[] = ['H', 'D', 'C', 'S'];
  const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: Card[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }

  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

/** Generate all C(n,k) combinations. */
function combinations<T>(arr: T[], k: number): T[][] {
  const result: T[][] = [];
  function helper(start: number, combo: T[]) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return result;
}

/** Evaluate the best 5-card hand from up to 7 cards. */
export function evaluateBestHand(cards: Card[]): EvaluatedHand {
  if (cards.length < 5) {
    return { rank: 'high_card', values: cards.map((c) => RANK_ORDER[c.rank]).sort((a, b) => b - a) };
  }

  const combos = combinations(cards, 5);
  let best: EvaluatedHand | null = null;

  for (const combo of combos) {
    const evaluated = evaluate5(combo);
    if (!best || compareHands(evaluated, best) > 0) {
      best = evaluated;
    }
  }

  return best!;
}

function evaluate5(cards: Card[]): EvaluatedHand {
  const sorted = [...cards].sort((a, b) => RANK_ORDER[b.rank] - RANK_ORDER[a.rank]);
  const values = sorted.map((c) => RANK_ORDER[c.rank]);

  const isFlush = sorted.every((c) => c.suit === sorted[0].suit);

  // Check straight (including wheel A-2-3-4-5)
  let isStraight = false;
  let straightHigh = 0;
  if (values[0] - values[4] === 4 && new Set(values).size === 5) {
    isStraight = true;
    straightHigh = values[0];
  } else if (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    // Wheel: A-2-3-4-5
    isStraight = true;
    straightHigh = 5;
  }

  // Count ranks
  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const groups = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  if (isStraight && isFlush) {
    if (straightHigh === 14) return { rank: 'royal_flush', values: [14] };
    return { rank: 'straight_flush', values: [straightHigh] };
  }

  if (groups[0][1] === 4) {
    return { rank: 'four_of_a_kind', values: [groups[0][0], groups[1][0]] };
  }

  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return { rank: 'full_house', values: [groups[0][0], groups[1][0]] };
  }

  if (isFlush) {
    return { rank: 'flush', values };
  }

  if (isStraight) {
    return { rank: 'straight', values: [straightHigh] };
  }

  if (groups[0][1] === 3) {
    const kickers = groups.slice(1).map((g) => g[0]).sort((a, b) => b - a);
    return { rank: 'three_of_a_kind', values: [groups[0][0], ...kickers] };
  }

  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    const kicker = groups[2][0];
    return { rank: 'two_pair', values: [...pairs, kicker] };
  }

  if (groups[0][1] === 2) {
    const kickers = groups.slice(1).map((g) => g[0]).sort((a, b) => b - a);
    return { rank: 'pair', values: [groups[0][0], ...kickers] };
  }

  return { rank: 'high_card', values };
}

/** Compare two hands. Returns >0 if a is better, <0 if b is better, 0 if tie. */
export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  const rankDiff = HAND_RANK_VALUE[a.rank] - HAND_RANK_VALUE[b.rank];
  if (rankDiff !== 0) return rankDiff;

  for (let i = 0; i < Math.min(a.values.length, b.values.length); i++) {
    if (a.values[i] !== b.values[i]) return a.values[i] - b.values[i];
  }
  return 0;
}

export function formatCard(card: Card): string {
  const suitSymbol: Record<string, string> = { H: '\u2665', D: '\u2666', C: '\u2663', S: '\u2660' };
  return `${card.rank}${suitSymbol[card.suit]}`;
}
