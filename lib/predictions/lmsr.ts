/**
 * LMSR (Logarithmic Market Scoring Rule) market maker for binary YES/NO
 * prediction markets.
 *
 * A market holds two share quantities — `qYes` and `qNo` — and a liquidity
 * parameter `b`. The cost function is
 *
 *     C(qYes, qNo) = b · ln(e^(qYes/b) + e^(qNo/b))
 *
 * The instantaneous YES price equals the implied probability:
 *
 *     priceYes = e^(qYes/b) / (e^(qYes/b) + e^(qNo/b))
 *
 * Buying Δ shares of a side costs `C(after) − C(before)`. Each winning share
 * pays out 1 coin at resolution. The market maker's worst-case subsidy is
 * bounded by `b · ln 2`.
 *
 * All functions are pure and side-effect free so they can be unit-tested and
 * shared between the server trade path and the client preview.
 */

export type Side = 'YES' | 'NO';

/** Numerically stable log(e^x + e^y) (log-sum-exp). */
function logSumExp(x: number, y: number): number {
  const m = Math.max(x, y);
  return m + Math.log(Math.exp(x - m) + Math.exp(y - m));
}

/** LMSR cost function C(qYes, qNo). */
export function cost(qYes: number, qNo: number, b: number): number {
  return b * logSumExp(qYes / b, qNo / b);
}

/** Implied probability of YES (also the YES price), in (0, 1). */
export function priceYes(qYes: number, qNo: number, b: number): number {
  // softmax of the two exponents, stable form.
  const m = Math.max(qYes / b, qNo / b);
  const ey = Math.exp(qYes / b - m);
  const en = Math.exp(qNo / b - m);
  return ey / (ey + en);
}

/** Implied probability of NO. */
export function priceNo(qYes: number, qNo: number, b: number): number {
  return 1 - priceYes(qYes, qNo, b);
}

/** Coin cost to buy `shares` of `side` at the current market state. */
export function costToBuyShares(
  qYes: number,
  qNo: number,
  b: number,
  side: Side,
  shares: number,
): number {
  if (shares <= 0) return 0;
  const before = cost(qYes, qNo, b);
  const after =
    side === 'YES'
      ? cost(qYes + shares, qNo, b)
      : cost(qYes, qNo + shares, b);
  return after - before;
}

/**
 * How many shares of `side` a coin `budget` buys at the current state.
 *
 * Closed-form inverse of the cost function. Buying Δ YES shares for budget m:
 *
 *     m = b · ln( (a·e^(Δ/b) + c) / (a + c) )   where a = e^(qYes/b), c = e^(qNo/b)
 *  => Δ = b · ln( ( e^(m/b)·(a + c) − c ) / a )
 *
 * Computed in the log domain for numerical stability. Returns 0 for a
 * non-positive budget.
 */
export function sharesForBudget(
  qYes: number,
  qNo: number,
  b: number,
  side: Side,
  budget: number,
): number {
  if (budget <= 0) return 0;
  // Work relative to the larger exponent to avoid overflow.
  const xYes = qYes / b;
  const xNo = qNo / b;
  const m = Math.max(xYes, xNo);
  const a = side === 'YES' ? Math.exp(xYes - m) : Math.exp(xNo - m); // own side
  const c = side === 'YES' ? Math.exp(xNo - m) : Math.exp(xYes - m); // other side
  const em = Math.exp(budget / b); // e^(m/b)
  const numerator = em * (a + c) - c;
  // numerator > 0 always for budget > 0 since em > 1.
  const delta = b * (Math.log(numerator) - Math.log(a));
  return delta;
}

/** Convenience: YES probability as an integer percentage 1..99. */
export function pricePercent(qYes: number, qNo: number, b: number): number {
  const p = Math.round(priceYes(qYes, qNo, b) * 100);
  return Math.min(99, Math.max(1, p));
}
