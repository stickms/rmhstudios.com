/**
 * Client-safe view types for listings (the server side is `lib/listings/*.server.ts`).
 *
 * `ListingView` is what the Store's market tabs draw: one row shape for every
 * kind of thing a member sells, with `kind` saying which and `href` where its
 * own page is. The per-market shapes the APIs answer with (the cosmetics
 * market's `MarketListingView`, the card market's `MarketGroup`, a storefront's
 * products) are unchanged; `toListingView*` below map them onto it.
 */
import type { resolveUser } from '@/lib/user-display';
import type { MarketGroup } from '@/lib/cards/market-types';

/** A storefront product as the owner's create / update endpoints answer with it. */
export interface StorefrontProductRow {
  id: string;
  creatorId: string;
  title: string;
  description: string | null;
  price: number;
  deliverable: string | null;
  active: boolean;
  salesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StorefrontProductItem {
  id: string;
  title: string;
  description: string | null;
  price: number;
  active: boolean;
  salesCount: number;
  createdAt: string;
  owned: boolean;
  deliverable: string | null;
}

export interface StorefrontResult {
  creator: ReturnType<typeof resolveUser>;
  isOwner: boolean;
  signedIn: boolean;
  products: StorefrontProductItem[];
}

/** A product on sale, across storefronts (the Store's Products tab). */
export interface LatestProduct {
  id: string;
  title: string;
  description: string | null;
  priceCoins: number;
  salesCount: number;
  createdAt: string;
  seller: ReturnType<typeof resolveUser>;
}

/** One row of a Store market tab, whatever is being sold. */
export interface ListingView {
  kind: 'card' | 'product';
  id: string;
  title: string;
  /** A short second line: the card's foil, the product's creator. */
  detail: string | null;
  priceCoins: number;
  /** How many are on offer at that price or above (cards), or how many sold (products). */
  count: number;
  /** The thing's own page, where it is bought (a router path). */
  href: string;
  /** Search params for that page (a foil card's `?foil=1`). */
  search?: { foil: true };
}

/**
 * The card market's cheapest-per-card group as a Store row. `foilDetail` words
 * the second line of a foil card (it is translated by the caller).
 */
export function cardGroupToListingView(
  g: MarketGroup & { cardTitle: string },
  foilDetail: (gameTitle: string) => string,
): ListingView {
  return {
    kind: 'card',
    id: `${g.gameId}|${g.cardIndex}|${g.foil}`,
    title: g.cardTitle,
    detail: g.foil ? foilDetail(g.title) : g.title,
    priceCoins: g.lowestPrice,
    count: g.count,
    href: `/games/market/${encodeURIComponent(g.gameId)}/${g.cardIndex}`,
    ...(g.foil ? { search: { foil: true as const } } : {}),
  };
}

/** A storefront product as a Store row. */
export function productToListingView(p: LatestProduct): ListingView {
  const handle = p.seller.handle ?? p.seller.id;
  return {
    kind: 'product',
    id: p.id,
    title: p.title,
    detail: p.seller.name ?? p.seller.handle ?? null,
    priceCoins: p.priceCoins,
    count: p.salesCount,
    href: `/store/${encodeURIComponent(handle)}`,
  };
}
