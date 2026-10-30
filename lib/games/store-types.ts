/** Client-safe shapes for the games Store front. */

export type StoreCard = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  kind: 'game' | 'app';
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  hue: number;
  href: string;
  /** Distinct players over the last two weeks (public players only). */
  players: number;
  rating: { average: number; count: number } | null;
};

export type StoreData = {
  featured: StoreCard[];
  trending: StoreCard[];
  topRated: StoreCard[];
  tags: { tag: string; count: number }[];
  /** Present when a tag or search is active. */
  results: StoreCard[] | null;
  tag: string | null;
  q: string | null;
};

export type AlsoPlayed = { id: string; title: string; thumbnailUrl: string | null; hue: number; players: number };
