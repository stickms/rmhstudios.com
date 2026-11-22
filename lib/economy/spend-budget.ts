/**
 * Monthly spending budget (s04-07) — the rules, with no database and no Prisma.
 *
 * A member can cap what they spend on the shop, unlocks, tips, gifts, coin
 * memberships and market buys per UTC calendar month (the same month the coin
 * statement uses). It is the staking cap's twin and shares its asymmetry:
 * setting or lowering the cap applies at once, raising or removing it waits
 * {@link LOOSENING_DELAY_MS}. The pending rule is `effectiveCap`'s, reused
 * below rather than restated, so a matured raise is the live cap before any
 * write has folded it in.
 *
 * Client-safe: the settings panel says "rises on 22 Nov" before it sends, and
 * the ledger decides the same thing when the spend lands.
 */
import { LOOSENING_DELAY_MS, NO_LIMITS, effectiveCap, hasMaturedPending, isLoosening } from './play-limits';

/** Smallest and largest budget a member can set. */
export const MIN_SPEND_CAP = 100;
export const MAX_SPEND_CAP = 10_000_000;

/** The notice fires on the first spend that takes the month to this share of the cap. */
export const NOTICE_PERCENT = 80;

/**
 * The ledger types that count against the budget. `WAGER` has its own daily
 * cap, `ADMIN` is staff adjusting a balance, `REWARD` is coins arriving, and
 * credits (`recipientId` only) are never summed because the sum is by sender.
 */
export const SPEND_TYPES = ['PURCHASE', 'TIP', 'GIFT', 'MEMBERSHIP', 'MARKET'] as const;
export type SpendType = (typeof SPEND_TYPES)[number];

export function countsAsSpending(type: string): type is SpendType {
  return (SPEND_TYPES as readonly string[]).includes(type);
}

/** The stored shape, as both tiers read it. */
export interface SpendBudget {
  monthlySpendCap: number | null;
  pendingSpendCap: number | null;
  pendingSpendCapAt: Date | null;
  /** `YYYY-MM` the 80% notice was last sent for. */
  spendNoticeMonth: string | null;
}

export const NO_BUDGET: SpendBudget = {
  monthlySpendCap: null,
  pendingSpendCap: null,
  pendingSpendCapAt: null,
  spendNoticeMonth: null,
};

/** `YYYY-MM` of the UTC month containing `now`. */
export function monthKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The UTC month containing `now`: `start` inclusive, `end` exclusive. */
export function monthBounds(now: Date): { start: Date; end: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1)) };
}

/** Adapt the budget columns onto the staking cap's shape so the pending rule is shared. */
function asCapShape(b: SpendBudget) {
  return {
    ...NO_LIMITS,
    dailyCoinCap: b.monthlySpendCap,
    pendingCap: b.pendingSpendCap,
    pendingCapAt: b.pendingSpendCapAt,
  };
}

/** The cap in force right now: a matured pending change counts before it is written. */
export function effectiveSpendCap(b: SpendBudget, now: Date): number | null {
  return effectiveCap(asCapShape(b), now);
}

export function hasMaturedSpendPending(b: SpendBudget, now: Date): boolean {
  return hasMaturedPending(asCapShape(b), now);
}

/** What a caller asked to change. At most one of the two. */
export interface SpendBudgetChange {
  /** `number` sets the budget, `null` removes it, `undefined` leaves it alone. */
  monthlySpendCap?: number | null;
  /** Drop a loosening that is still waiting. */
  cancelPendingSpendCap?: boolean;
}

export function hasSpendBudgetChange(c: SpendBudgetChange): boolean {
  return c.monthlySpendCap !== undefined || c.cancelPendingSpendCap === true;
}

export interface ResolvedSpendChange {
  next: SpendBudget;
  /** When a parked loosening lands; null when nothing was parked. */
  deferredUntil: Date | null;
}

/**
 * Apply a requested change. Pure; the only place the asymmetry is written for
 * the budget. A loosening REPLACES any pending change rather than queueing a
 * second, so the delay cannot be laddered; a tightening cancels one in flight.
 */
export function applySpendBudgetChange(
  current: SpendBudget,
  change: SpendBudgetChange,
  now: Date,
): ResolvedSpendChange {
  const baseCap = effectiveSpendCap(current, now);
  const matured = hasMaturedSpendPending(current, now);
  const next: SpendBudget = {
    monthlySpendCap: baseCap,
    pendingSpendCap: matured ? null : current.pendingSpendCap,
    pendingSpendCapAt: matured ? null : current.pendingSpendCapAt,
    spendNoticeMonth: current.spendNoticeMonth,
  };

  if (change.cancelPendingSpendCap) {
    next.pendingSpendCap = null;
    next.pendingSpendCapAt = null;
    return { next, deferredUntil: null };
  }

  if (change.monthlySpendCap === undefined) return { next, deferredUntil: null };

  if (isLoosening(baseCap, change.monthlySpendCap)) {
    next.pendingSpendCap = change.monthlySpendCap;
    next.pendingSpendCapAt = new Date(now.getTime() + LOOSENING_DELAY_MS);
    return { next, deferredUntil: next.pendingSpendCapAt };
  }
  next.monthlySpendCap = change.monthlySpendCap;
  next.pendingSpendCap = null;
  next.pendingSpendCapAt = null;
  return { next, deferredUntil: null };
}

/** Coins left this month, never negative. */
export function remainingBudget(cap: number, spent: number): number {
  return Math.max(0, cap - spent);
}

/** Would spending `amount` on top of `spent` go over `cap`? Exactly the cap is allowed. */
export function wouldExceed(cap: number, spent: number, amount: number): boolean {
  return spent + amount > cap;
}

/**
 * Does this spend take the month from below 80% of the cap to at or above it?
 * Integer arithmetic (`x * 100 >= cap * 80`), so 80% of an odd cap is not
 * rounded the wrong way.
 */
export function crossesNotice(cap: number, spent: number, amount: number): boolean {
  const line = cap * NOTICE_PERCENT;
  return spent * 100 < line && (spent + amount) * 100 >= line;
}
