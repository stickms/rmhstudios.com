/** Client-safe shapes for the card market. */

import type { DayBucket } from '@/lib/cards/price-history';

export type MarketGroup = {
  gameId: string;
  title: string;
  hue: number;
  cardIndex: number;
  foil: boolean;
  /** Cheapest listing the viewer could buy (not their own). */
  lowestPrice: number;
  /** Listings at any price, excluding the viewer's own. */
  count: number;
  /** The listing that "Buy lowest" buys. */
  buyListingId: string;
};

export type MyListing = {
  id: string;
  gameId: string;
  title: string;
  hue: number;
  cardIndex: number;
  foil: boolean;
  priceCoins: number;
  createdAt: string;
};

export type MarketData = {
  groups: MarketGroup[];
  mine: MyListing[];
  signedIn: boolean;
  /** The viewer's coin balance; null when signed out. */
  balance: number | null;
};

export type CardListingRow = { id: string; priceCoins: number; mine: boolean };
export type CardOrderRow = { priceCoins: number; mine: boolean };

/** Everything the page for one card shows. */
export type CardMarketData = {
  gameId: string;
  title: string;
  hue: number;
  cardIndex: number;
  foil: boolean;
  signedIn: boolean;
  balance: number | null;
  /** How many of this card the viewer holds (to offer Sell). */
  held: number;
  listings: CardListingRow[];
  orders: CardOrderRow[];
  /** The viewer's own open order for this card. */
  myOrder: { id: string; priceCoins: number } | null;
  history: DayBucket[];
  summary: { median: number; low: number; high: number; volume: number } | null;
};
