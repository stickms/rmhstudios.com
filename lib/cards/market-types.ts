/** Client-safe shapes for the card market. */

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
