/**
 * Pure blackjack card-scoring functions.
 * Shared by server (game handler) and client (display).
 */

export type Suit = 'H' | 'D' | 'C' | 'S';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  J: 10, Q: 10, K: 10, A: 11,
};

/** Calculate the best hand value. Aces count as 11 unless that would bust, then 1. */
export function handValue(hand: Card[]): { value: number; soft: boolean } {
  let total = 0;
  let aces = 0;

  for (const card of hand) {
    total += RANK_VALUES[card.rank];
    if (card.rank === 'A') aces++;
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return { value: total, soft: aces > 0 };
}

export function isBlackjack(hand: Card[]): boolean {
  return hand.length === 2 && handValue(hand).value === 21;
}

export function isBusted(hand: Card[]): boolean {
  return handValue(hand).value > 21;
}

export function formatHandValue(hand: Card[]): string {
  if (hand.length === 0) return '';
  const { value, soft } = handValue(hand);
  if (value > 21) return 'BUST';
  if (isBlackjack(hand)) return 'BJ';
  return soft ? `soft ${value}` : String(value);
}

/** Create a shuffled shoe of `deckCount` standard 52-card decks. */
export function createShoe(deckCount = 6): Card[] {
  const suits: Suit[] = ['H', 'D', 'C', 'S'];
  const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  const shoe: Card[] = [];
  for (let d = 0; d < deckCount; d++) {
    for (const suit of suits) {
      for (const rank of ranks) {
        shoe.push({ suit, rank });
      }
    }
  }

  // Fisher-Yates shuffle
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }

  return shoe;
}
