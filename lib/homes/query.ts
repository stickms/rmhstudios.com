/**
 * RMHHomes — filter <-> query-string codec (client-safe).
 *
 * The browse UI serializes filters into the URL (shareable/bookmarkable) and
 * the API parses them back. Keeping both directions here prevents drift.
 */

import {
  DEFAULT_FILTERS,
  LISTING_TYPES,
  PROPERTY_TYPES,
  SORT_ORDERS,
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

export function parseFilters(params: URLSearchParams): SearchFilters {
  const typeRaw = params.get('type');
  const listingType: ListingType | 'any' =
    typeRaw === 'any' || (typeRaw && (LISTING_TYPES as string[]).includes(typeRaw))
      ? (typeRaw as ListingType | 'any')
      : DEFAULT_FILTERS.listingType;

  const propertyTypes = (params.get('propertyTypes') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is PropertyType => (PROPERTY_TYPES as string[]).includes(s));

  const sortRaw = params.get('sort');
  const sort: SortOrder = (SORT_ORDERS as string[]).includes(sortRaw ?? '')
    ? (sortRaw as SortOrder)
    : DEFAULT_FILTERS.sort;

  const latRaw = params.get('lat');
  const lngRaw = params.get('lng');
  const lat = latRaw != null && latRaw !== '' ? Number(latRaw) : undefined;
  const lng = lngRaw != null && lngRaw !== '' ? Number(lngRaw) : undefined;

  return {
    location: (params.get('location') ?? '').trim().slice(0, 160),
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    radiusKm: clampInt(params.get('radiusKm'), 1, 400, DEFAULT_FILTERS.radiusKm),
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
  };
}

export function serializeFilters(filters: SearchFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.location) p.set('location', filters.location);
  if (filters.lat != null) p.set('lat', String(filters.lat));
  if (filters.lng != null) p.set('lng', String(filters.lng));
  if (filters.radiusKm !== DEFAULT_FILTERS.radiusKm) p.set('radiusKm', String(filters.radiusKm));
  if (filters.listingType !== DEFAULT_FILTERS.listingType) p.set('type', filters.listingType);
  if (filters.propertyTypes.length) p.set('propertyTypes', filters.propertyTypes.join(','));
  if (filters.minPrice != null) p.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice != null) p.set('maxPrice', String(filters.maxPrice));
  if (filters.minBeds != null) p.set('minBeds', String(filters.minBeds));
  if (filters.minBaths != null) p.set('minBaths', String(filters.minBaths));
  if (filters.petsAllowed) p.set('pets', '1');
  if (filters.sort !== DEFAULT_FILTERS.sort) p.set('sort', filters.sort);
  if (filters.page > 1) p.set('page', String(filters.page));
  return p;
}
