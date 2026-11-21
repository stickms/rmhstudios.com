/**
 * Splitting a bill: tax and tip, then shares that add up to the cent.
 *
 * Shares are computed in whole cents and the leftover cents of a split that
 * does not divide evenly are handed out by largest remainder, so five people
 * splitting 100.00 pay 20.00 each and three splitting 100.00 pay 33.34, 33.33,
 * 33.33 — never a total that is a cent short. Rounding each share up (to 0.05,
 * 0.50 or 1.00) is offered for paying in cash, with the surplus shown as extra tip.
 */

export interface Person {
  name: string;
  /** Relative share: 2 pays twice what 1 pays. */
  weight: number;
}

export interface BillInput {
  subtotal: number;
  taxPercent: number;
  tipPercent: number;
  /** Tip on the amount before tax (the usual US convention) or after it. */
  tipOn: 'pre-tax' | 'post-tax';
  people: readonly Person[];
  /** Round each share up to this many cents (0 for exact). */
  roundUpTo: 0 | 5 | 50 | 100;
}

export interface Share {
  name: string;
  amount: number;
}

export interface BillResult {
  tax: number;
  tip: number;
  total: number;
  shares: Share[];
  /** What the rounded-up shares pay beyond the total (0 when not rounding). */
  surplus: number;
}

const toCents = (n: number) => Math.round(n * 100);

/** Split `totalCents` by `weights`, in whole cents, by largest remainder. */
export function splitCents(totalCents: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (totalCents * w) / sum);
  const floors = exact.map(Math.floor);
  let left = totalCents - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    left--;
  }
  return floors;
}

export function splitBill(input: BillInput): BillResult {
  const subtotal = toCents(input.subtotal);
  const tax = Math.round((subtotal * input.taxPercent) / 100);
  const tipBase = input.tipOn === 'pre-tax' ? subtotal : subtotal + tax;
  const tip = Math.round((tipBase * input.tipPercent) / 100);
  const total = subtotal + tax + tip;
  let shares = splitCents(
    total,
    input.people.map((p) => Math.max(0, p.weight)),
  );
  if (input.roundUpTo > 0) shares = shares.map((c) => Math.ceil(c / input.roundUpTo) * input.roundUpTo);
  const paid = shares.reduce((a, b) => a + b, 0);
  return {
    tax: tax / 100,
    tip: tip / 100,
    total: total / 100,
    shares: input.people.map((p, i) => ({ name: p.name, amount: (shares[i] ?? 0) / 100 })),
    surplus: Math.max(0, paid - total) / 100,
  };
}
