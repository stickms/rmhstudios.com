/**
 * Rotating daily shop + build-your-bundle — pure and client-safe.
 * Feature ideas C2 and C3 in docs/plans/2026-10-12-feature-ideas-every-surface.md.
 *
 * Fortnite's item shop, for a catalog that is otherwise a wall of a thousand
 * items: each UTC day a deterministic handful of cosmetics is put in the
 * window. Nothing is scarce — every item stays buyable from the full shop at
 * the same price — so what rotates is attention, not supply.
 *
 * "Deterministic" is the property that matters. There is no table of "today's
 * items" to seed, to drift between instances, or to lose in a restore: the set
 * is a pure function of the UTC date and the catalog, so the web tier, the
 * bundle purchase route and the wishlist alert job all compute the same eight
 * items without talking to each other.
 *
 * The one caveat is the catalog itself. Adding an item to `SHOP_ITEMS` changes
 * the eligible pool and therefore may reshuffle the day. Catalog changes ship
 * with a deploy, and the set is only ever *read* (the bundle route re-derives it
 * and validates against it), never persisted, so a mid-day reshuffle is a
 * cosmetic wobble — not a pricing or ownership error.
 */

import { SHOP_ITEMS, type Rarity, type ShopItem, type ShopItemKind } from '@/lib/shop/catalog';

/** How many cosmetics are featured per day. */
export const DAILY_FEATURED_COUNT = 8;
/** How many of the featured items make a bundle. */
export const BUNDLE_SIZE = 3;
/** Percent knocked off the sum of the three items. */
export const BUNDLE_DISCOUNT_PCT = 20;
/** No more than this many of one kind, so the window is not eight name colours. */
const MAX_PER_KIND = 2;

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` of the UTC day containing `at`. */
export function utcDateKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** The instant the current rotation ends (next 00:00 UTC). */
export function nextRotationAt(at: Date): Date {
  return new Date((Math.floor(at.getTime() / DAY_MS) + 1) * DAY_MS);
}

/** FNV-1a over a string → 32-bit seed. */
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — the same tiny PRNG the casino path-sim uses. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Items that can be featured: tier-gated items need the purchase route's tier check, so they sit out. */
function isFeaturable(item: ShopItem): boolean {
  return !item.requiresTier && item.price > 0;
}

/**
 * The featured item ids for a UTC date key, in display order. Pure: same date +
 * same catalog → same answer on every instance.
 */
export function dailyFeaturedIds(
  dateKey: string,
  catalog: readonly ShopItem[] = SHOP_ITEMS,
): string[] {
  // Sort by id first so the shuffle does not depend on catalog declaration
  // order — reordering the file must not reshuffle the shop.
  const pool = catalog
    .filter(isFeaturable)
    .map((i) => ({ id: i.id, kind: i.kind }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const rand = mulberry32(hashSeed(`rmh-daily-shop:${dateKey}`));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }

  const perKind = new Map<ShopItemKind, number>();
  const picked: string[] = [];
  for (const c of pool) {
    if (picked.length >= DAILY_FEATURED_COUNT) break;
    const n = perKind.get(c.kind) ?? 0;
    if (n >= MAX_PER_KIND) continue;
    perKind.set(c.kind, n + 1);
    picked.push(c.id);
  }
  // A catalog too small to satisfy the per-kind cap still fills the window.
  for (const c of pool) {
    if (picked.length >= DAILY_FEATURED_COUNT) break;
    if (!picked.includes(c.id)) picked.push(c.id);
  }
  return picked;
}

/** Bundle price for items with the given list prices: the sum, less the discount, rounded down. */
export function bundlePrice(prices: readonly number[]): number {
  const sum = prices.reduce((a, b) => a + b, 0);
  return Math.floor((sum * (100 - BUNDLE_DISCOUNT_PCT)) / 100);
}

export type BundleCheck =
  | { ok: true; price: number; listPrice: number }
  | { ok: false; error: 'WRONG_SIZE' | 'DUPLICATE' | 'NOT_FEATURED' | 'UNKNOWN_ITEM' };

/**
 * Validate a bundle selection against today's featured set and price it. The
 * client never supplies a price: the server calls this and charges its answer.
 */
export function checkBundle(
  itemIds: readonly string[],
  featuredIds: readonly string[],
  getItem: (id: string) => ShopItem | undefined,
): BundleCheck {
  if (itemIds.length !== BUNDLE_SIZE) return { ok: false, error: 'WRONG_SIZE' };
  if (new Set(itemIds).size !== itemIds.length) return { ok: false, error: 'DUPLICATE' };
  const featured = new Set(featuredIds);
  const items: ShopItem[] = [];
  for (const id of itemIds) {
    if (!featured.has(id)) return { ok: false, error: 'NOT_FEATURED' };
    const item = getItem(id);
    if (!item) return { ok: false, error: 'UNKNOWN_ITEM' };
    items.push(item);
  }
  const prices = items.map((i) => i.price);
  return {
    ok: true,
    price: bundlePrice(prices),
    listPrice: prices.reduce((a, b) => a + b, 0),
  };
}

/** One featured item as the daily-shop API returns it (client-safe shape). */
export interface DailyShopItem {
  id: string;
  kind: ShopItemKind;
  name: string;
  description: string;
  price: number;
  rarity: Rarity;
  data: { color?: string; gradient?: string; emoji?: string; themeId?: string };
  owned: boolean;
}

export interface DailyShopView {
  dateKey: string;
  /** ISO instant the rotation ends. */
  rotatesAt: string;
  items: DailyShopItem[];
  coins: number;
  signedIn: boolean;
  bundle: { size: number; discountPct: number };
}
