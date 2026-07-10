/**
 * RMHHomes — shared types (community housing marketplace).
 *
 * Client-safe (no server-only imports). RMHHomes is a marketplace where RMH
 * users post their own rentals/houses; every listing is real and owned by an
 * author. These types describe the listing DTO the API returns and the
 * search/filter contract shared between the API and the UI.
 */

export type ListingType = 'RENT' | 'SALE';
export const LISTING_TYPES: ListingType[] = ['RENT', 'SALE'];

export type PropertyType = 'APARTMENT' | 'HOUSE' | 'CONDO' | 'TOWNHOUSE' | 'ROOM' | 'OTHER';
export const PROPERTY_TYPES: PropertyType[] = [
  'APARTMENT',
  'HOUSE',
  'CONDO',
  'TOWNHOUSE',
  'ROOM',
  'OTHER',
];

export type ListingStatus = 'ACTIVE' | 'RENTED' | 'SOLD' | 'REMOVED';

/** Minimal author info shown on a listing. */
export interface ListingAuthor {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}

/**
 * A listing as returned to the client. `price` is in whole USD dollars (the DB
 * stores cents). Timestamps are ISO strings.
 */
export interface Listing {
  id: string;
  status: ListingStatus;
  listingType: ListingType;
  propertyType: PropertyType;

  title: string;
  description: string;
  price: number;

  beds: number;
  baths: number;
  sqft: number | null;

  address: string | null;
  city: string;
  state: string;
  postalCode: string | null;
  lat: number;
  lng: number;

  amenities: string[];
  petsAllowed: boolean;
  availableFrom: string | null;

  images: string[];
  /** Subset of `images` that were AI-generated (show the disclaimer on these). */
  aiImages: string[];
  viewsCount: number;

  createdAt: string;
  updatedAt: string;

  author: ListingAuthor;
  /** Whether the requesting user has favorited this listing. */
  favorited: boolean;
  /** Whether the requesting user is the author (can edit/delete). */
  isOwner: boolean;
}

export type SortOrder = 'newest' | 'price_asc' | 'price_desc';
export const SORT_ORDERS: SortOrder[] = ['newest', 'price_asc', 'price_desc'];

/**
 * Browse/search filters. `location` is free text geocoded server-side into a
 * center; results are then limited to `radiusKm` around it. With no location,
 * the newest active listings everywhere are returned.
 */
export interface SearchFilters {
  location: string;
  lat?: number;
  lng?: number;
  radiusKm: number;

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
}

export const DEFAULT_FILTERS: SearchFilters = {
  location: '',
  radiusKm: 40,
  listingType: 'any',
  propertyTypes: [],
  sort: 'newest',
  page: 1,
  pageSize: 24,
};

export interface SearchCenter {
  lat: number;
  lng: number;
  label: string;
}

export interface SearchResponse {
  listings: Listing[];
  total: number;
  page: number;
  pageSize: number;
  center: SearchCenter | null;
}

/** The payload used to create or update a listing (post form → API). */
export interface ListingInput {
  listingType: ListingType;
  propertyType: PropertyType;
  title: string;
  description: string;
  price: number;
  beds: number;
  baths: number;
  sqft?: number | null;
  address?: string | null;
  city: string;
  state: string;
  postalCode?: string | null;
  lat: number;
  lng: number;
  amenities: string[];
  petsAllowed: boolean;
  availableFrom?: string | null;
  images: string[];
  /** URLs in `images` that were AI-generated. */
  aiImages: string[];
}

/** A saved-search watch as returned to the client. */
export interface Watch {
  id: string;
  label: string;
  listingType: ListingType | null;
  propertyTypes: PropertyType[];
  locationLabel: string | null;
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  /** Whole USD dollars (DB stores cents). */
  minPrice: number | null;
  maxPrice: number | null;
  minBeds: number | null;
  minBaths: number | null;
  petsRequired: boolean;
  active: boolean;
  createdAt: string;
}

/** Payload to create a watch (usually derived from the current browse filters). */
export interface WatchInput {
  label: string;
  listingType?: ListingType | null;
  propertyTypes: PropertyType[];
  locationLabel?: string | null;
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  minBeds?: number | null;
  minBaths?: number | null;
  petsRequired: boolean;
}
