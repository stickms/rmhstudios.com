/**
 * Roulette game logic — shared by server and client.
 *
 * American double-zero roulette (0, 00, 1-36).
 * 00 is represented internally as -1.
 * Supports inside bets (straight, split, street, corner, line, topline)
 * and outside bets (red/black, odd/even, high/low, dozens, columns).
 */

/** 00 is stored as -1 internally */
export const DOUBLE_ZERO = -1;

export const NUMBERS = [DOUBLE_ZERO, ...Array.from({ length: 37 }, (_, i) => i)]; // 00, 0-36

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export const BLACK_NUMBERS = new Set([
  2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
]);

/** American roulette wheel order (for animation). */
export const WHEEL_ORDER = [
  0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1,
  DOUBLE_ZERO,
  27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2,
];

export type BetType =
  // Inside bets
  | 'straight'     // single number (35:1)
  | 'split'        // 2 numbers (17:1)
  | 'street'       // 3 numbers in a row (11:1)
  | 'corner'       // 4 numbers (8:1)
  | 'line'         // 6 numbers / two streets (5:1)
  | 'topline'      // 0, 00, 1, 2, 3 (6:1)
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

/** Display label for a number (handles 00). */
export function numberLabel(n: number): string {
  return n === DOUBLE_ZERO ? '00' : String(n);
}

/** Get the payout multiplier for a bet type. */
export function getPayoutMultiplier(type: BetType): number {
  switch (type) {
    case 'straight': return 35;
    case 'split': return 17;
    case 'street': return 11;
    case 'corner': return 8;
    case 'topline': return 6;
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
    case 'topline': return [0, DOUBLE_ZERO, 1, 2, 3];
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
  if (n === 0 || n === DOUBLE_ZERO) return 'green';
  if (RED_NUMBERS.has(n)) return 'red';
  return 'black';
}

/** Generate a random result (server-side). 38 pockets: 0, 00(-1), 1-36 */
export function spin(): number {
  const idx = Math.floor(Math.random() * 38);
  if (idx === 37) return DOUBLE_ZERO; // 00
  return idx; // 0-36
}

/** All valid number values on the board */
export const ALL_BOARD_NUMBERS = [DOUBLE_ZERO, ...Array.from({ length: 37 }, (_, i) => i)];

/**
 * Get adjacent numbers for split bets on a standard 3-column board.
 * Returns pairs [n, neighbor] for all valid splits from number n.
 */
export function getSplitNeighbors(n: number): number[][] {
  if (n <= 0) return []; // 0 and 00 splits handled separately
  const col = ((n - 1) % 3) + 1; // 1, 2, or 3
  const neighbors: number[][] = [];
  // Right neighbor (same row, next column)
  if (col < 3) neighbors.push([n, n + 1]);
  // Below neighbor (next row)
  if (n + 3 <= 36) neighbors.push([n, n + 3]);
  return neighbors;
}

/**
 * Get corner groups that include number n.
 * A corner covers 4 numbers at the intersection of 2 rows and 2 columns.
 */
export function getCornerGroups(n: number): number[][] {
  if (n <= 0) return [];
  const col = ((n - 1) % 3) + 1;
  const corners: number[][] = [];
  // Top-left corner (n is bottom-right)
  if (col > 1 && n - 3 > 0) corners.push([n - 4, n - 3, n - 1, n]);
  // Top-right corner (n is bottom-left)
  if (col < 3 && n - 3 > 0) corners.push([n - 3, n - 2, n, n + 1]);
  // Bottom-left corner (n is top-right)
  if (col > 1 && n + 3 <= 36) corners.push([n - 1, n, n + 2, n + 3]);
  // Bottom-right corner (n is top-left)
  if (col < 3 && n + 3 <= 36) corners.push([n, n + 1, n + 3, n + 4]);
  return corners;
}
