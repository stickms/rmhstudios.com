/**
 * Roulette game logic — shared by server and client.
 *
 * European/single-zero roulette (0-36).
 * Supports inside bets (straight, split, street, corner, line)
 * and outside bets (red/black, odd/even, high/low, dozens, columns).
 */

export const NUMBERS = Array.from({ length: 37 }, (_, i) => i); // 0-36

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export const BLACK_NUMBERS = new Set([
  2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
]);

/** Wheel order for European roulette (for animation). */
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36,
  11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9,
  22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export type BetType =
  // Inside bets
  | 'straight'     // single number (35:1)
  | 'split'        // 2 numbers (17:1)
  | 'street'       // 3 numbers in a row (11:1)
  | 'corner'       // 4 numbers (8:1)
  | 'line'         // 6 numbers / two streets (5:1)
  // Outside bets
  | 'red'
  | 'black'
  | 'odd'
  | 'even'
  | 'low'          // 1-18
  | 'high'         // 19-36
  | 'dozen1'       // 1-12
  | 'dozen2'       // 13-24
  | 'dozen3'       // 25-36
  | 'column1'      // 1,4,7,...,34
  | 'column2'      // 2,5,8,...,35
  | 'column3';     // 3,6,9,...,36

export interface Bet {
  type: BetType;
  numbers: number[];  // the actual numbers covered
  amount: number;
}

/** Get the payout multiplier for a bet type. */
export function getPayoutMultiplier(type: BetType): number {
  switch (type) {
    case 'straight': return 35;
    case 'split': return 17;
    case 'street': return 11;
    case 'corner': return 8;
    case 'line': return 5;
    case 'red': case 'black':
    case 'odd': case 'even':
    case 'low': case 'high':
      return 1;
    case 'dozen1': case 'dozen2': case 'dozen3':
    case 'column1': case 'column2': case 'column3':
      return 2;
    default: return 0;
  }
}

/** Get the numbers covered by an outside bet type. */
export function getOutsideBetNumbers(type: BetType): number[] {
  switch (type) {
    case 'red': return [...RED_NUMBERS];
    case 'black': return [...BLACK_NUMBERS];
    case 'odd': return NUMBERS.filter((n) => n > 0 && n % 2 === 1);
    case 'even': return NUMBERS.filter((n) => n > 0 && n % 2 === 0);
    case 'low': return NUMBERS.filter((n) => n >= 1 && n <= 18);
    case 'high': return NUMBERS.filter((n) => n >= 19 && n <= 36);
    case 'dozen1': return NUMBERS.filter((n) => n >= 1 && n <= 12);
    case 'dozen2': return NUMBERS.filter((n) => n >= 13 && n <= 24);
    case 'dozen3': return NUMBERS.filter((n) => n >= 25 && n <= 36);
    case 'column1': return NUMBERS.filter((n) => n > 0 && n % 3 === 1);
    case 'column2': return NUMBERS.filter((n) => n > 0 && n % 3 === 2);
    case 'column3': return NUMBERS.filter((n) => n > 0 && n % 3 === 0);
    default: return [];
  }
}

/** Check if a bet wins for a given result number. */
export function betWins(bet: Bet, result: number): boolean {
  return bet.numbers.includes(result);
}

/** Calculate payout for a winning bet (includes original stake). */
export function calculatePayout(bet: Bet, result: number): number {
  if (!betWins(bet, result)) return 0;
  return bet.amount + bet.amount * getPayoutMultiplier(bet.type);
}

/** Get the color of a number. */
export function getNumberColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green';
  if (RED_NUMBERS.has(n)) return 'red';
  return 'black';
}

/** Generate a random result (server-side). */
export function spin(): number {
  return Math.floor(Math.random() * 37); // 0-36
}
