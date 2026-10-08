/**
 * Responsible play (W8) — the rules, with no database and no Prisma.
 *
 * Client-safe on purpose: the settings panel needs to say "this takes effect
 * tomorrow at 14:20" *before* it sends anything, and the server needs to decide
 * the same thing when it lands. Two copies of that arithmetic would disagree
 * the first time one of them was edited, so it lives here once and both import
 * it. Same split as `lib/economy/ledger-core.ts` ↔ `ledger.server.ts`.
 *
 * ## The asymmetry is the feature
 *
 * A limit you can lift the moment it bites is not a limit; it is a dialog box
 * between a person and the thing they asked not to do. So:
 *
 *   - **Tightening applies immediately.** A lower cap, a new cap where there
 *     was none, a cool-off, an exclusion — all effective on the next request.
 *   - **Loosening waits {@link LOOSENING_DELAY_MS}.** A higher cap, or removing
 *     one, is parked in `pendingCap`/`pendingCapAt` and applies a day later.
 *   - **A self-exclusion cannot be shortened at all**, by the member or by an
 *     admin. It can only be extended. This is the one control on the site with
 *     no undo, and that is deliberate: the member set it precisely so that a
 *     later version of themselves could not.
 *
 * The delay is not a cooling-off gimmick. It is the difference between a
 * decision made once, calmly, and a decision made repeatedly at the moment of
 * maximum motivation to make it badly.
 */

/** How long a loosening waits before it takes effect. */
export const LOOSENING_DELAY_MS = 24 * 60 * 60 * 1000;

/** Largest daily cap we will store. Above this, "capped" is not meaningful. */
export const MAX_DAILY_CAP = 10_000_000;

/** Longest self-exclusion we will set in one go. Renewable, never shortenable. */
export const MAX_EXCLUSION_DAYS = 365;

/** Longest cool-off. Deliberately short — a cool-off is a break, not an exit. */
export const MAX_COOL_OFF_DAYS = 30;

/** The stored shape, as both tiers read it. Dates, not strings. */
export interface PlayLimits {
  dailyCoinCap: number | null;
  selfExcludedUntil: Date | null;
  coolOffUntil: Date | null;
  pendingCap: number | null;
  pendingCapAt: Date | null;
}

/** A member with no row. Every field open. */
export const NO_LIMITS: PlayLimits = {
  dailyCoinCap: null,
  selfExcludedUntil: null,
  coolOffUntil: null,
  pendingCap: null,
  pendingCapAt: null,
};

/** Why a stake was refused. Maps 1:1 to an `ErrorCode`. */
export type PlayRefusal = 'SELF_EXCLUDED' | 'COOL_OFF_ACTIVE' | 'STAKE_LIMIT_REACHED';

/**
 * The cap in force right now.
 *
 * A pending loosening whose time has come is the effective cap even though no
 * write has happened yet — the row is rewritten lazily on the next settings
 * read. Enforcement must not wait for that write, or a member whose loosening
 * matured at 3am stays capped until they next open the page.
 */
export function effectiveCap(limits: PlayLimits, now: Date = new Date()): number | null {
  if (limits.pendingCapAt && limits.pendingCapAt.getTime() <= now.getTime()) {
    return limits.pendingCap;
  }
  return limits.dailyCoinCap;
}

/** True when a matured pending change is still sitting unapplied in the row. */
export function hasMaturedPending(limits: PlayLimits, now: Date = new Date()): boolean {
  return limits.pendingCapAt !== null && limits.pendingCapAt.getTime() <= now.getTime();
}

/**
 * Is the member blocked outright, and by which control?
 *
 * Exclusion is checked before cool-off so the more serious state is the one the
 * member is told about when both are somehow set.
 */
export function blockedBy(limits: PlayLimits, now: Date = new Date()): PlayRefusal | null {
  if (limits.selfExcludedUntil && limits.selfExcludedUntil.getTime() > now.getTime()) {
    return 'SELF_EXCLUDED';
  }
  if (limits.coolOffUntil && limits.coolOffUntil.getTime() > now.getTime()) {
    return 'COOL_OFF_ACTIVE';
  }
  return null;
}

/**
 * Should the risk surfaces be hidden from navigation and search for this member?
 *
 * Only self-exclusion hides them. A cool-off refuses the stake but leaves the
 * site's shape alone, because a fortnight of missing menu entries is a
 * different and much louder thing than a fortnight of not betting.
 */
export function hidesRiskSurfaces(limits: PlayLimits, now: Date = new Date()): boolean {
  return blockedBy(limits, now) === 'SELF_EXCLUDED';
}

/** Start of the member's current UTC day — the window the daily cap covers. */
export function dayWindowStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** What a caller asked to change. Every field optional; absent = leave alone. */
export interface LimitChange {
  /** `number` sets a cap, `null` removes it, `undefined` leaves it alone. */
  dailyCoinCap?: number | null;
  /** Days from now. Only ever extends an existing exclusion. */
  excludeForDays?: number;
  /** Days from now. Only ever extends an existing cool-off. */
  coolOffForDays?: number;
}

/** The row to write, plus what the member should be told about the timing. */
export interface ResolvedChange {
  next: PlayLimits;
  /** True when some part of the request was parked rather than applied. */
  deferred: boolean;
  /** When the deferred part lands. Null when nothing was deferred. */
  deferredUntil: Date | null;
}

/**
 * True when `next` gives the member more rope than `current`.
 *
 * Null (no cap) is the loosest value there is, so removing a cap always
 * loosens, and setting one where there was none always tightens.
 */
export function isLoosening(current: number | null, next: number | null): boolean {
  if (next === null) return current !== null;
  if (current === null) return false;
  return next > current;
}

/**
 * Apply a requested change to the current limits.
 *
 * Pure, total, and the only place the asymmetry is implemented. Both the API
 * route and its tests call this; nothing else computes a next-state by hand.
 *
 * Invalid requests are rejected by the route's zod schema before they reach
 * here — this function's contract is that it is given sane numbers and returns
 * the row to persist.
 */
export function applyChange(
  current: PlayLimits,
  change: LimitChange,
  now: Date = new Date(),
): ResolvedChange {
  // Start from the effective view, so a matured pending change is folded in
  // rather than silently resurrected by the next edit.
  const baseCap = effectiveCap(current, now);
  const next: PlayLimits = {
    dailyCoinCap: baseCap,
    selfExcludedUntil: current.selfExcludedUntil,
    coolOffUntil: current.coolOffUntil,
    pendingCap: hasMaturedPending(current, now) ? null : current.pendingCap,
    pendingCapAt: hasMaturedPending(current, now) ? null : current.pendingCapAt,
  };

  let deferredUntil: Date | null = null;

  if (change.dailyCoinCap !== undefined) {
    if (isLoosening(baseCap, change.dailyCoinCap)) {
      // Park it. Note this REPLACES any pending change rather than queueing a
      // second one, so the delay cannot be laddered by sending three requests.
      next.pendingCap = change.dailyCoinCap;
      next.pendingCapAt = new Date(now.getTime() + LOOSENING_DELAY_MS);
      deferredUntil = next.pendingCapAt;
    } else {
      // Tightening lands now, and cancels any loosening already in flight —
      // otherwise yesterday's "raise it" would undo today's "lower it".
      next.dailyCoinCap = change.dailyCoinCap;
      next.pendingCap = null;
      next.pendingCapAt = null;
    }
  }

  if (change.excludeForDays !== undefined) {
    const until = new Date(now.getTime() + change.excludeForDays * 24 * 60 * 60 * 1000);
    // Extend only. A request that would shorten a live exclusion is ignored,
    // not rejected: the member's earlier self is the one being honoured.
    next.selfExcludedUntil =
      current.selfExcludedUntil && current.selfExcludedUntil.getTime() > until.getTime()
        ? current.selfExcludedUntil
        : until;
  }

  if (change.coolOffForDays !== undefined) {
    const until = new Date(now.getTime() + change.coolOffForDays * 24 * 60 * 60 * 1000);
    next.coolOffUntil =
      current.coolOffUntil && current.coolOffUntil.getTime() > until.getTime()
        ? current.coolOffUntil
        : until;
  }

  return { next, deferred: deferredUntil !== null, deferredUntil };
}
