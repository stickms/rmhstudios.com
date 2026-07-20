/**
 * Player Marketplace (§8) — tradability whitelist + pure economy math.
 *
 * Client-safe and side-effect-free on purpose: the API routes, the server
 * transaction module, and the unit tests all import from here without pulling in
 * Prisma. The `.server` module owns the DB transaction; this file owns the
 * *rules* (what may be listed, price bounds, the fee split, anomaly detection).
 *
 * Tradability is an explicit **allowlist, default DENY**. Only purely-cosmetic
 * shop items of a handful of kinds are tradable; everything else — premium
 * themes, banners, pets, anything membership/tier-gated, and any id not in the
 * shop catalog (achievement/promo/event grants) — is untradable. New shop kinds
 * are untradable until deliberately added to `TRADABLE_KINDS`.
 */

import { getShopItem, type ShopItemKind } from '@/lib/shop/catalog';

// ─── Constants (the fraud/economy knobs) ────────────────────────────────────

/** Marketplace fee in basis points (1000 = 10%), burned as a coin sink. */
export const MARKET_FEE_BPS = 1000; // 10%
/** Lowest coin price a listing may be set to. */
export const MIN_PRICE = 10;
/** Highest coin price a listing may be set to. */
export const MAX_PRICE = 100_000;
/** Minimum account level required to *sell* on the market. */
export const MIN_SELLER_LEVEL = 3;
/** Minimum account age (days) required to *sell* on the market. */
export const MIN_ACCOUNT_AGE_DAYS = 7;
/** A price ≥ this × the 30-day median for the item is treated as anomalous. */
export const ANOMALY_MULTIPLIER = 10;
/** Per-seller cap on simultaneously ACTIVE listings (abuse control). */
export const MAX_ACTIVE_LISTINGS = 25;
/**
 * A relisted item may not be priced below this fraction of its *primary* shop
 * price (when it's still sold there), so the secondary market can't be used to
 * undercut the shop to nothing. Items no longer in the catalog have no floor.
 */
export const SHOP_PRICE_FLOOR_FRACTION = 0.25; // 25%
/**
 * Minimum number of recent SOLD data points before the anomaly guard engages.
 * Below this there isn't enough signal, so a legitimately-expensive first sale
 * isn't spuriously held.
 */
export const ANOMALY_MIN_SAMPLES = 3;

// ─── Tradability allowlist (default DENY) ───────────────────────────────────

/**
 * The cosmetic kinds that may be traded: name colors, avatar frames, badges and
 * post flair. Deliberately excludes THEME (premium/tier-gated), BANNER and PET —
 * add a kind here only after confirming none of its items are membership- or
 * achievement-linked.
 */
export const TRADABLE_KINDS: ReadonlySet<ShopItemKind> = new Set<ShopItemKind>([
  'NAME_COLOR',
  'AVATAR_FRAME',
  'BADGE',
  'POST_FLAIR',
]);

/**
 * True iff `itemId` is a real catalog item of a tradable kind that is *not*
 * gated behind a subscription tier. Everything else denies:
 *  - ids not in the shop catalog (achievement/promo/event grants) → DENY
 *  - THEME / BANNER / PET → DENY
 *  - any item with `requiresTier` (membership-adjacent) → DENY
 */
export function isTradable(itemId: string): boolean {
  const item = getShopItem(itemId);
  if (!item) return false; // not a shop item → never tradable
  if (item.requiresTier) return false; // membership/tier-gated → never tradable
  return TRADABLE_KINDS.has(item.kind);
}

/** The set of every tradable catalog id (handy for building the "Sell" list). */
export function tradableItemIds(ids: readonly string[]): string[] {
  return ids.filter((id) => isTradable(id));
}

// ─── Pure economy math ──────────────────────────────────────────────────────

export interface FeeSplit {
  /** Coins the buyer pays (the listing price). */
  price: number;
  /** Coins burned as the marketplace sink (rounded down). */
  fee: number;
  /** Coins credited to the seller (`price - fee`). */
  proceeds: number;
}

/**
 * Split a sale price into the seller's proceeds (90%) and the burned fee (10%).
 * The fee rounds **down**, so the seller keeps the rounding remainder and the
 * burn is never larger than the nominal 10%. With `price ≥ MIN_PRICE (10)` the
 * fee is always ≥ 1 and proceeds are always ≥ 1 (both strictly positive).
 */
export function marketFee(price: number): FeeSplit {
  const fee = Math.floor((price * MARKET_FEE_BPS) / 10_000);
  return { price, fee, proceeds: price - fee };
}

/** The minimum listing price for an item, honoring the primary-shop floor. */
export function minPriceFor(itemId: string): number {
  const item = getShopItem(itemId);
  const floor = item ? Math.ceil(item.price * SHOP_PRICE_FLOOR_FRACTION) : 0;
  return Math.max(MIN_PRICE, floor);
}

/** True if `price` is within `[minPriceFor(itemId), MAX_PRICE]` and an integer. */
export function isPriceInBounds(itemId: string, price: number): boolean {
  if (!Number.isInteger(price)) return false;
  return price >= minPriceFor(itemId) && price <= MAX_PRICE;
}

/** Median of a numeric list (returns 0 for an empty list). */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * True when `price` is anomalously high relative to recent sales — i.e. there
 * are at least `ANOMALY_MIN_SAMPLES` recent SOLD prices and `price` is at least
 * `ANOMALY_MULTIPLIER×` their median. Such a purchase is frozen (HELD) for admin
 * review instead of releasing funds. Too little history ⇒ never anomalous.
 */
export function isAnomalousPrice(price: number, recentSoldPrices: readonly number[]): boolean {
  if (recentSoldPrices.length < ANOMALY_MIN_SAMPLES) return false;
  const m = median(recentSoldPrices);
  if (m <= 0) return false;
  return price >= ANOMALY_MULTIPLIER * m;
}
