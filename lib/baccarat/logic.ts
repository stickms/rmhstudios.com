/**
 * Pure baccarat card-scoring functions.
 * Shared by server (game handler) and client (display).
 *
 * Standard baccarat rules:
 * - Card values: A=1, 2-9=face value, 10/J/Q/K=0
 * - Hand value is sum mod 10
 * - Banker/Player drawing rules per tableau
 */

export type Suit = 'H' | 'D' | 'C' | 'S';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

const RANK_VALUES: Record<Rank, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 0, J: 0, Q: 0, K: 0,
};

/** Calculate baccarat hand value (sum mod 10). */
export function handValue(hand: Card[]): number {
  let total = 0;
  for (const card of hand) {
    total += RANK_VALUES[card.rank];
  }
  return total % 10;
}

/** Check if a 2-card hand is a natural (8 or 9). */
export function isNatural(hand: Card[]): boolean {
  return hand.length === 2 && handValue(hand) >= 8;
}

export type BaccaratResult = 'player' | 'banker' | 'tie';

export interface SideBetResults {
  playerPair: boolean;
  bankerPair: boolean;
  // Dragon bonus: natural win, or win by >= 4 margin
  playerDragonBonus: number; // 0 = lost, otherwise payout multiplier
  bankerDragonBonus: number;
}

/**
 * Determine whether the player draws a third card.
 * Player stands on 6-7, draws on 0-5.
 */
export function playerDrawsThird(playerHand: Card[]): boolean {
  const val = handValue(playerHand);
  return val <= 5;
}

/**
 * Determine whether the banker draws a third card,
 * given the banker's hand and the player's third card (if any).
 */
export function bankerDrawsThird(bankerHand: Card[], playerThirdCard: Card | null): boolean {
  const bankerVal = handValue(bankerHand);

  // If player didn't draw, banker follows same rules as player
  if (!playerThirdCard) {
    return bankerVal <= 5;
  }

  const pThirdVal = RANK_VALUES[playerThirdCard.rank];

  // Banker drawing tableau
  if (bankerVal <= 2) return true;
  if (bankerVal === 3) return pThirdVal !== 8;
  if (bankerVal === 4) return pThirdVal >= 2 && pThirdVal <= 7;
  if (bankerVal === 5) return pThirdVal >= 4 && pThirdVal <= 7;
  if (bankerVal === 6) return pThirdVal === 6 || pThirdVal === 7;
  return false; // 7 = stand
}

/** Determine the result of a completed hand. */
export function determineResult(playerHand: Card[], bankerHand: Card[]): BaccaratResult {
  const pVal = handValue(playerHand);
  const bVal = handValue(bankerHand);
  if (pVal > bVal) return 'player';
  if (bVal > pVal) return 'banker';
  return 'tie';
}

/** Calculate dragon bonus payout multiplier (0 = no win). */
function dragonBonusMultiplier(winnerHand: Card[], loserHand: Card[], isNaturalWin: boolean): number {
  if (isNaturalWin) return 1; // natural win pays 1:1
  const margin = handValue(winnerHand) - handValue(loserHand);
  if (margin === 4) return 1;
  if (margin === 5) return 2;
  if (margin === 6) return 4;
  if (margin === 7) return 6;
  if (margin === 8) return 10;
  if (margin === 9) return 30;
  return 0;
}

/** Calculate all side bet results. */
export function calculateSideBets(playerHand: Card[], bankerHand: Card[], result: BaccaratResult): SideBetResults {
  const playerPair = playerHand.length >= 2 && playerHand[0].rank === playerHand[1].rank;
  const bankerPair = bankerHand.length >= 2 && bankerHand[0].rank === bankerHand[1].rank;

  const naturalWin = isNatural(playerHand) || isNatural(bankerHand);

  let playerDragonBonus = 0;
  let bankerDragonBonus = 0;

  if (result === 'player') {
    playerDragonBonus = dragonBonusMultiplier(playerHand, bankerHand, naturalWin);
  } else if (result === 'banker') {
    bankerDragonBonus = dragonBonusMultiplier(bankerHand, playerHand, naturalWin);
  }
  // Tie = dragon bonus loses

  return { playerPair, bankerPair, playerDragonBonus, bankerDragonBonus };
}

/** Create a shuffled shoe of `deckCount` standard 52-card decks. */
export function createShoe(deckCount = 8): Card[] {
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

/** Standard payout multipliers */
export const PAYOUTS = {
  player: 1,       // 1:1
  banker: 0.95,    // 1:1 minus 5% commission
  tie: 8,          // 8:1
  playerPair: 11,  // 11:1
  bankerPair: 11,  // 11:1
} as const;
