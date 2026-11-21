/**
 * RMHHomes — scraper types (server only).
 *
 * The homes scraper aggregates real housing/apartment postings from public
 * third-party feeds (Craigslist regional RSS, generic RSS housing feeds) so the
 * marketplace has inventory beyond what RMH members post themselves. Every
 * discovered posting becomes an EXTERNAL `HomeListing` that links back to its
 * original URL — we aggregate and attribute, we never re-host the source.
 */

import type { PropertyType } from '../types';

export type HomeProvider = 'CRAIGSLIST' | 'RSS';

/** The subset of a HomeSource row the adapters/pipeline read. */
export interface HomeSourceConfig {
  id: string;
  key: string;
  provider: HomeProvider;
  label: string;
  region: string | null;
  category: string | null;
  url: string | null;
  listingType: 'RENT' | 'SALE';
  defaultCity: string | null;
  defaultState: string | null;
  defaultLat: number | null;
  defaultLng: number | null;
}

/**
 * A listing as pulled from a feed, before it's assessed/persisted. Numeric
 * fields are null when the feed didn't expose them (assessment fills defaults).
 */
export interface NormalizedListing {
  /** Provider's stable id for this posting (dedupe key with the source). */
  externalId: string;
  title: string;
  descriptionHtml: string | null;
  /** Canonical original posting URL. */
  url: string;
  /** Whole USD dollars — monthly rent or sale price. Null when unknown. */
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  propertyType: PropertyType | null;
  petsAllowed: boolean | null;
  /** Free-text locality from the feed (neighborhood/area), for display. */
  locationRaw: string | null;
  lat: number | null;
  lng: number | null;
  imageUrls: string[];
  postedAt: Date | null;
}

export interface AdapterContext {
  source: HomeSourceConfig;
  fetchImpl?: typeof fetch;
}

export interface HomeSourceAdapter {
  provider: HomeProvider;
  /** The feed URL to fetch for this source, or null if it can't be built. */
  feedUrl(source: HomeSourceConfig): string | null;
  /** Fetch + parse the feed into normalized listings (never throws on a bad feed). */
  discover(ctx: AdapterContext): Promise<NormalizedListing[]>;
}
