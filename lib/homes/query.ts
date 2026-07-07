/**
 * RMHHomes — filter <-> query-string codec.
 *
 * Client-safe. The UI serializes {@link SearchFilters} into the URL so searches
 * are shareable/bookmarkable and back/forward works; the API route parses the
 * same params back into a validated filter object. Keeping both directions in
 * one file guarantees they never drift.
 */

import {
  DEFAULT_FILTERS,
  LISTING_SOURCES,
  PROPERTY_TYPES,
  SORT_ORDERS,
  type ListingSource,
  type ListingType,
  type PropertyType,
  type SearchFilters,
  type SortOrder,
} from './types';

function clampInt(v: string | null, lo: number, hi: number, fallback: number): number {
  const n = v == null ? NaN : Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function optionalPositive(v: string | null): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

/** Parse (and defensively clamp) query params into validated filters. */
export function parseFilters(params: URLSearchParams): SearchFilters {
  const listingTypeRaw = params.get('type');
  const listingType: ListingType | 'any' =
    listingTypeRaw === 'sale' || listingTypeRaw === 'rent' || listingTypeRaw === 'any'
      ? listingTypeRaw
      : DEFAULT_FILTERS.listingType;

  const propertyTypes = (params.get('propertyTypes') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is PropertyType => (PROPERTY_TYPES as string[]).includes(s));

  const sortRaw = params.get('sort');
  const sort: SortOrder = (SORT_ORDERS as string[]).includes(sortRaw ?? '')
    ? (sortRaw as SortOrder)
    : DEFAULT_FILTERS.sort;

  const sources = (params.get('sources') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is ListingSource => (LISTING_SOURCES as string[]).includes(s));

  const latRaw = params.get('lat');
  const lngRaw = params.get('lng');
  const lat = latRaw != null && latRaw !== '' ? Number(latRaw) : undefined;
  const lng = lngRaw != null && lngRaw !== '' ? Number(lngRaw) : undefined;

  return {
    location: (params.get('location') ?? '').trim().slice(0, 160),
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    radiusKm: clampInt(params.get('radiusKm'), 1, 200, DEFAULT_FILTERS.radiusKm ?? 25),
    listingType,
    propertyTypes,
    minPrice: optionalPositive(params.get('minPrice')),
    maxPrice: optionalPositive(params.get('maxPrice')),
    minBeds: optionalPositive(params.get('minBeds')),
    minBaths: optionalPositive(params.get('minBaths')),
    petsAllowed: params.get('pets') === '1' ? true : undefined,
    sort,
    page: clampInt(params.get('page'), 1, 500, 1),
    pageSize: clampInt(params.get('pageSize'), 1, 60, DEFAULT_FILTERS.pageSize),
    sources: sources.length ? sources : undefined,
  };
}

/** Serialize filters back into a compact URLSearchParams (omitting defaults). */
export function serializeFilters(filters: SearchFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.location) p.set('location', filters.location);
  if (filters.lat != null) p.set('lat', String(filters.lat));
  if (filters.lng != null) p.set('lng', String(filters.lng));
  if (filters.radiusKm != null && filters.radiusKm !== DEFAULT_FILTERS.radiusKm) {
    p.set('radiusKm', String(filters.radiusKm));
  }
  if (filters.listingType !== DEFAULT_FILTERS.listingType) p.set('type', filters.listingType);
  if (filters.propertyTypes.length) p.set('propertyTypes', filters.propertyTypes.join(','));
  if (filters.minPrice != null) p.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice != null) p.set('maxPrice', String(filters.maxPrice));
  if (filters.minBeds != null) p.set('minBeds', String(filters.minBeds));
  if (filters.minBaths != null) p.set('minBaths', String(filters.minBaths));
  if (filters.petsAllowed) p.set('pets', '1');
  if (filters.sort !== DEFAULT_FILTERS.sort) p.set('sort', filters.sort);
  if (filters.page > 1) p.set('page', String(filters.page));
  if (filters.sources?.length) p.set('sources', filters.sources.join(','));
  return p;
}
