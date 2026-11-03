// =============================================================================
// ALTAIR -- Server-side guard for the single-player meta save
// =============================================================================
// INTERIM HARDENING, not verification. /api/altair/meta used to store whatever coin balance the
// client sent (0..100M), so one POST minted any amount. Single-player runs are not yet replayable on
// the server (docs/altair-multiplayer.md "Verified results", and the "Solo" notes there), so the
// earned part of the balance still comes from the client, but it is now bounded:
//   - Purchases are checked: an upgrade level can only rise, never above its max, and its cost is
//     taken from the server's own balance. A purchase the server's balance cannot pay is refused.
//   - Earned coins are limited by a refilling allowance: at most INCOME_PER_SECOND coins accrue per
//     real second up to ALLOWANCE_CAP (the most a full clear with every multiplier can pay is
//     ~4.5k coins over >=10 real minutes, i.e. <8/s). A client claiming more than its allowance is
//     clamped to it, not rejected, so a legitimate save is never lost to a rounding disagreement.
//   - The client may lower its balance freely (class unlock purchases are not priced server-side).
// A cheater can therefore still claim ~INCOME_PER_SECOND coins per second of wall clock without
// playing; they can no longer mint 100M in one request.
// =============================================================================

import { META_UPGRADES } from './data/meta-upgrades';

export const INCOME_PER_SECOND = 8;
export const ALLOWANCE_CAP = 8000;
export const MAX_COINS = 100_000_000;

export interface MetaRow {
  coins: number;
  upgrades: Record<string, number>;
  /** Earned coins the server will still accept right now (before refilling for elapsed time). */
  coinAllowance: number;
  coinAllowanceAt: Date | null;
}

export interface MetaClaim {
  coins: number;
  upgrades: Record<string, number>;
}

export type MetaDecision =
  | { ok: true; coins: number; upgrades: Record<string, number>; coinAllowance: number; coinAllowanceAt: Date; clamped: boolean }
  | { ok: false; error: string };

const isLevel = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** Coins the server's own price list charges to take `prev` to `next` (or an error). */
export function priceUpgrades(
  prev: Record<string, number>,
  next: Record<string, number>,
): { cost: number } | { error: string } {
  const known = new Map(META_UPGRADES.map((u) => [u.id, u]));
  let cost = 0;
  for (const [id, raw] of Object.entries(next)) {
    const def = known.get(id);
    if (!def) {
      // A retired upgrade id left in an old save: carried over untouched, never raised or created.
      if (raw === (prev[id] ?? 0)) continue;
      return { error: `Unknown upgrade ${id}` };
    }
    if (!isLevel(raw) || raw > def.maxLevel) return { error: `Invalid level for ${id}` };
    const before = prev[id] ?? 0;
    if (raw < before) return { error: `Upgrade ${id} cannot go down` };
    for (let level = before; level < raw; level++) cost += def.costs[level] ?? Infinity;
  }
  for (const [id, before] of Object.entries(prev)) {
    if (before > 0 && !(id in next)) return { error: `Upgrade ${id} cannot be removed` };
  }
  return { cost };
}

/** Most coins a first-ever save (progress made while signed out) may import: all upgrades cost ~34k. */
export const FIRST_IMPORT_MAX_COINS = 50_000;

export interface ReconcileOptions {
  /**
   * True for clients that submit their runs for replay (lib/altair/solo): the server credits earned coins
   * itself from the verified replay, so a rise in the client's balance is never minted from its claim.
   * False keeps the capped allowance above (old clients, and runs the server could not verify).
   */
  verifiedOnly?: boolean;
}

export function reconcileMetaSave(prev: MetaRow | null, claim: MetaClaim, now: Date, opts: ReconcileOptions = {}): MetaDecision {
  if (!Number.isFinite(claim.coins) || claim.coins < 0 || claim.coins > MAX_COINS) {
    return { ok: false, error: 'Invalid coins' };
  }
  if (prev === null) {
    // The account has no server progress yet: import what was earned signed out, bounded and validated.
    const priced = priceUpgrades({}, claim.upgrades);
    if ('error' in priced) return { ok: false, error: priced.error };
    return {
      ok: true,
      coins: Math.min(Math.floor(claim.coins), FIRST_IMPORT_MAX_COINS),
      upgrades: claim.upgrades,
      coinAllowance: ALLOWANCE_CAP,
      coinAllowanceAt: now,
      clamped: claim.coins > FIRST_IMPORT_MAX_COINS,
    };
  }
  const priced = priceUpgrades(prev.upgrades, claim.upgrades);
  if ('error' in priced) return { ok: false, error: priced.error };

  const afterPurchases = prev.coins - priced.cost;
  if (afterPurchases < 0) return { ok: false, error: 'Not enough coins for that purchase' };

  // Refill the allowance for the time since it was last touched.
  const elapsed = prev.coinAllowanceAt ? Math.max(0, (now.getTime() - prev.coinAllowanceAt.getTime()) / 1000) : Infinity;
  const refilled = Math.min(ALLOWANCE_CAP, prev.coinAllowance + (Number.isFinite(elapsed) ? elapsed * INCOME_PER_SECOND : ALLOWANCE_CAP));

  const claimedGain = Math.floor(claim.coins) - afterPurchases;
  if (opts.verifiedOnly && claimedGain > 0) {
    return {
      ok: true,
      coins: afterPurchases,
      upgrades: claim.upgrades,
      coinAllowance: prev.coinAllowance,
      coinAllowanceAt: prev.coinAllowanceAt ?? now,
      clamped: true,
    };
  }
  if (claimedGain <= 0) {
    // Spent or unchanged: take the client's (lower) balance.
    return {
      ok: true,
      coins: Math.floor(claim.coins),
      upgrades: claim.upgrades,
      coinAllowance: Math.floor(refilled),
      coinAllowanceAt: now,
      clamped: false,
    };
  }
  const granted = Math.min(claimedGain, Math.floor(refilled));
  return {
    ok: true,
    coins: afterPurchases + granted,
    upgrades: claim.upgrades,
    coinAllowance: Math.floor(refilled) - granted,
    coinAllowanceAt: now,
    clamped: granted < claimedGain,
  };
}
