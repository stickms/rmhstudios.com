/**
 * RMHHomes — shared types.
 *
 * Client-safe (no server-only imports). Describes the normalized listing shape
 * that every provider adapts its raw data into, plus the search filter/response
 * contracts shared between the API layer and the React UI.
 */

/** Where a listing came from. Kept small and stable — used in listing IDs. */
export type ListingSource = 'sample' | 'craigslist' | 'rentcast';

export const LISTING_SOURCES: ListingSource[] = ['sample', 'craigslist', 'rentcast'];

/** Rent vs. buy. */
export type ListingType = 'rent' | 'sale';

/** Coarse property categories, normalized across every provider. */
export type PropertyType = 'apartment' | 'house' | 'condo' | 'townhouse' | 'room' | 'other';

export const PROPERTY_TYPES: PropertyType[] = [
  'apartment',
  'house',
  'condo',
  'townhouse',
  'room',
  'other',
];

/**
 * A single normalized listing. Providers map their raw payloads into this
 * shape; everything downstream (filtering, ranking, UI, saved snapshots) only
 * ever sees this. `id` is globally unique and stable: `"<source>:<externalId>"`.
 */
export interface Listing {
  id: string;
  source: ListingSource;
  /** Provider-native id (the part after the colon in `id`). */
  externalId: string;

  title: string;
  description?: string;

  listingType: ListingType;
  propertyType: PropertyType;

  /** USD. Monthly rent for rentals, sale price for `sale`. */
  price: number | null;

  beds: number | null;
  baths: number | null;
  sqft: number | null;

  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;

  lat: number | null;
  lng: number | null;

  /** Primary image; `images` holds the full gallery when available. */
  imageUrl?: string;
  images?: string[];

  /** Canonical link back to the source listing. */
  url?: string;

  amenities?: string[];
  petsAllowed?: boolean | null;

  /** ISO-8601 timestamps. */
  availableFrom?: string;
  postedAt?: string;
}

export type SortOrder = 'relevance' | 'price_asc' | 'price_desc' | 'newest';

export const SORT_ORDERS: SortOrder[] = ['relevance', 'price_asc', 'price_desc', 'newest'];

/**
 * A search request. `location` is free text ("Rochester, NY"); the server
 * geocodes it into `center`. `lat`/`lng`/`radiusKm` may be supplied directly
 * (e.g. "search this map area") to skip geocoding.
 */
export interface SearchFilters {
  location: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;

  listingType: ListingType | 'any';
  propertyTypes: PropertyType[];

  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  minBaths?: number;
  petsAllowed?: boolean;

  sort: SortOrder;
  page: number;
  pageSize: number;

  /** Restrict to a subset of providers. Empty/undefined = all enabled. */
  sources?: ListingSource[];
}

export const DEFAULT_FILTERS: SearchFilters = {
  location: '',
  listingType: 'rent',
  propertyTypes: [],
  sort: 'relevance',
  page: 1,
  pageSize: 24,
  radiusKm: 25,
};

/** Resolved search center after geocoding. */
export interface SearchCenter {
  lat: number;
  lng: number;
  label: string;
}

/** Per-provider status for observability — surfaced in the UI. */
export interface ProviderStatus {
  source: ListingSource;
  ok: boolean;
  count: number;
  /** Present when `ok` is false or the provider is disabled. */
  note?: string;
}

export interface SearchResponse {
  listings: Listing[];
  /** Total matches across all providers (pre-pagination). */
  total: number;
  page: number;
  pageSize: number;
  center: SearchCenter | null;
  providers: ProviderStatus[];
  /** True when results were served from cache. */
  cached: boolean;
}
