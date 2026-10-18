/**
 * Coin savings goals — pure and client-safe.
 * Feature idea C1 in docs/plans/2026-10-12-feature-ideas-every-surface.md.
 *
 * Monzo pots, for coins: a member picks something in the store or market,
 * the wallet shows a goal ("Neon trail — 4,200 / 6,000"), and the projection
 * answers the only question anyone asks of a goal: *when?*
 *
 * A goal does not lock coins. Locking would make it an escrow, and escrow is
 * a ledger concern with its own correctness bar; a goal is a view over the
 * balance the member already has, which keeps this module free of money
 * movement entirely. The projection reads the member's recent NET earning
 * (earned minus spent, per day) from `CoinTransaction` history — net, not
 * gross, because a member who earns 500/day and spends 480 is 20/day from
 * their goal, not 500.
 *
 * Earning is spiky (a tournament prize, a quiet week), so the rate is an
 * exponentially-weighted mean over daily nets with a 7-day half-life: recent
 * habits count most, but one big day does not promise next week.
 */

export interface DailyNet {
  /** UTC day index (Math.floor(epochMs / 86_400_000)). */
  day: number;
  /** Earned − spent that day, whole coins (may be negative). */
  net: number;
}

export type Projection =
  | { status: 'reached' }
  | { status: 'on-track'; perDay: number; daysLeft: number; etaDay: number }
  | { status: 'stalled'; perDay: number };

const HALF_LIFE_DAYS = 7;
const LOOKBACK_DAYS = 28;

/** EW-mean net coins per day over the lookback window ending at `today`. */
export function netRate(history: readonly DailyNet[], today: number): number {
  const byDay = new Map(history.map((h) => [h.day, h.net]));
  const decay = Math.pow(0.5, 1 / HALF_LIFE_DAYS);
  let num = 0;
  let den = 0;
  for (let age = 1; age <= LOOKBACK_DAYS; age++) {
    const w = Math.pow(decay, age - 1);
    num += w * (byDay.get(today - age) ?? 0);
    den += w;
  }
  return den === 0 ? 0 : num / den;
}

export function project(
  balance: number,
  target: number,
  history: readonly DailyNet[],
  today: number,
): Projection {
  if (balance >= target) return { status: 'reached' };
  const perDay = netRate(history, today);
  // Under one coin a day is "stalled": an ETA a year out helps nobody.
  if (perDay < 1) return { status: 'stalled', perDay };
  // The epsilon absorbs float noise in the weighted mean (99.99999… /day must
  // not turn an exact 5-day goal into 6).
  const daysLeft = Math.ceil((target - balance) / perDay - 1e-9);
  return { status: 'on-track', perDay, daysLeft, etaDay: today + daysLeft };
}

/** 0–1 progress for the ring, clamped. */
export function progress(balance: number, target: number): number {
  if (target <= 0) return 1;
  return Math.min(1, Math.max(0, balance / target));
}
