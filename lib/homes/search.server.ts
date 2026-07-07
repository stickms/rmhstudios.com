/**
 * RMHHomes — search orchestrator (server only).
 *
 * The heart of the platform. Given validated {@link SearchFilters}:
 *   1. Resolve the search center (geocode the free-text location, or use the
 *      lat/lng the caller supplied).
 *   2. Fan out to every enabled provider in parallel, each isolated so one
 *      slow/failing source can't sink the search.
 *   3. Merge, dedupe, apply the full filter set defensively, rank, paginate.
 *   4. Cache the merged provider results (pre-filter) so pagination and small
 *      filter tweaks are instant and don't re-hit upstream APIs.
 *
 * Individual listings are also cached by id so listing-detail pages resolve
 * without a database round-trip.
 */

import { apiCache } from '@/lib/cache';
import type {
  Listing,
  ListingSource,
  ProviderStatus,
  SearchCenter,
  SearchFilters,
  SearchResponse,
} from './types';
import { resolveCenter, haversineKm } from './geo.server';
import type { ListingProvider } from './providers/provider';
import { SampleProvider } from './providers/sample.server';
import { CraigslistProvider } from './providers/craigslist.server';
import { RentCastProvider } from './providers/rentcast.server';

/** Provider registry. Order here is the tie-break order in ranking. */
const PROVIDERS: ListingProvider[] = [
  new RentCastProvider(),
  new CraigslistProvider(),
  new SampleProvider(),
];

/** Raw (merged, pre-filter) provider results are cached for this long. */
const RAW_TTL_MS = 5 * 60 * 1000;
/** Individual listings cached for detail pages. */
const LISTING_TTL_MS = 30 * 60 * 1000;

interface RawSearch {
  listings: Listing[];
  providers: ProviderStatus[];
  /** True when the only listings available are from the demo (sample) source. */
  demo: boolean;
}

function rawCacheKey(center: SearchCenter, filters: SearchFilters): string {
  // Center + listingType + radius + source selection determine the upstream
  // fetch. Everything else (price/beds/sort/page) is applied in-memory.
  const sources = (filters.sources ?? []).slice().sort().join(',');
  return [
    'homes:raw',
    center.lat.toFixed(3),
    center.lng.toFixed(3),
    filters.listingType,
    filters.radiusKm ?? 25,
    sources || 'all',
  ].join(':');
}

function providerEnabledForRequest(p: ListingProvider, filters: SearchFilters): boolean {
  if (filters.sources && filters.sources.length && !filters.sources.includes(p.source)) {
    return false;
  }
  return p.isEnabled();
}

/** Run every provider in parallel; never throws — failures become statuses. */
async function runProviders(center: SearchCenter, filters: SearchFilters): Promise<RawSearch> {
  const settled = await Promise.all(
    PROVIDERS.map(async (p): Promise<{ status: ProviderStatus; listings: Listing[] }> => {
      if (filters.sources && filters.sources.length && !filters.sources.includes(p.source)) {
        return {
          status: { source: p.source, ok: true, count: 0, note: 'Not selected' },
          listings: [],
        };
      }
      if (!p.isEnabled()) {
        return {
          status: { source: p.source, ok: false, count: 0, note: p.disabledReason() },
          listings: [],
        };
      }
      try {
        const listings = await p.search({ center, filters });
        return {
          status: { source: p.source, ok: true, count: listings.length },
          listings,
        };
      } catch (err) {
        return {
          status: {
            source: p.source,
            ok: false,
            count: 0,
            note: err instanceof Error ? err.message : 'Provider error',
          },
          listings: [],
        };
      }
    }),
  );

  // Real listings take priority. The sample source is a demo safety net, so
  // whenever a real provider (RentCast/Craigslist) returns anything for this
  // query we drop the sample listings entirely rather than diluting real
  // inventory with generated ones.
  const realCount = settled
    .filter((s) => s.status.source !== 'sample' && s.status.ok)
    .reduce((n, s) => n + s.listings.length, 0);

  const sampleSuperseded = realCount > 0;
  const merged = settled.flatMap((s) =>
    s.status.source === 'sample' && sampleSuperseded ? [] : s.listings,
  );
  const listings = dedupe(merged);
  const demo = realCount === 0 && listings.some((l) => l.source === 'sample');

  // Reflect reality in the status strip: when real listings win, the sample
  // source contributed nothing to the shown results.
  const providers = settled.map((s) =>
    s.status.source === 'sample' && sampleSuperseded
      ? { ...s.status, count: 0, note: 'Hidden — showing real listings' }
      : s.status,
  );
  return { listings, providers, demo };
}

/** Drop exact-id duplicates, keeping the first (registry-order) occurrence. */
function dedupe(listings: Listing[]): Listing[] {
  const seen = new Set<string>();
  const out: Listing[] = [];
  for (const l of listings) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    out.push(l);
  }
  return out;
}

function withinRadius(l: Listing, center: SearchCenter, radiusKm: number): boolean {
  // Listings without coordinates (some Craigslist posts) are kept — we can't
  // prove they're out of range, and dropping them would lose real inventory.
  if (l.lat == null || l.lng == null) return true;
  return haversineKm({ lat: l.lat, lng: l.lng }, center) <= radiusKm;
}

/** Apply the full filter set that upstreams can't (or don't reliably) enforce. */
function applyFilters(
  listings: Listing[],
  filters: SearchFilters,
  center: SearchCenter,
): Listing[] {
  const radiusKm = filters.radiusKm ?? 25;
  return listings.filter((l) => {
    if (!withinRadius(l, center, radiusKm)) return false;
    if (filters.listingType !== 'any' && l.listingType !== filters.listingType) return false;
    if (filters.propertyTypes.length && !filters.propertyTypes.includes(l.propertyType)) {
      return false;
    }
    if (filters.minPrice != null && (l.price == null || l.price < filters.minPrice)) return false;
    if (filters.maxPrice != null && l.price != null && l.price > filters.maxPrice) return false;
    if (filters.minBeds != null && (l.beds == null || l.beds < filters.minBeds)) return false;
    if (filters.minBaths != null && (l.baths == null || l.baths < filters.minBaths)) return false;
    if (filters.petsAllowed && l.petsAllowed === false) return false;
    return true;
  });
}

function rank(listings: Listing[], filters: SearchFilters, center: SearchCenter): Listing[] {
  const sorted = listings.slice();
  switch (filters.sort) {
    case 'price_asc':
      sorted.sort((a, b) => priceOr(a, Infinity) - priceOr(b, Infinity));
      break;
    case 'price_desc':
      sorted.sort((a, b) => priceOr(b, -Infinity) - priceOr(a, -Infinity));
      break;
    case 'newest':
      sorted.sort((a, b) => postedMs(b) - postedMs(a));
      break;
    case 'relevance':
    default:
      // Closest to center first, then most recent.
      sorted.sort((a, b) => {
        const da = distanceOr(a, center);
        const db = distanceOr(b, center);
        if (da !== db) return da - db;
        return postedMs(b) - postedMs(a);
      });
      break;
  }
  return sorted;
}

function priceOr(l: Listing, fallback: number): number {
  return l.price ?? fallback;
}
function postedMs(l: Listing): number {
  const t = l.postedAt ? Date.parse(l.postedAt) : NaN;
  return Number.isFinite(t) ? t : 0;
}
function distanceOr(l: Listing, center: SearchCenter): number {
  if (l.lat == null || l.lng == null) return Number.MAX_SAFE_INTEGER;
  return haversineKm({ lat: l.lat, lng: l.lng }, center);
}

function cacheListings(listings: Listing[]): void {
  for (const l of listings) {
    apiCache.set(`homes:listing:${l.id}`, l, LISTING_TTL_MS);
  }
}

/** Look up a cached listing (populated by any recent search) for detail pages. */
export function getCachedListing(id: string): Listing | null {
  return apiCache.get<Listing>(`homes:listing:${id}`) ?? null;
}

/**
 * Execute a full search. Resolves the center, fetches (or reuses cached) raw
 * provider results, then filters/ranks/paginates in memory.
 */
export async function searchListings(filters: SearchFilters): Promise<SearchResponse> {
  // 1. Resolve center.
  let center: SearchCenter | null = null;
  if (filters.lat != null && filters.lng != null) {
    center = { lat: filters.lat, lng: filters.lng, label: filters.location || 'Selected area' };
  } else if (filters.location.trim()) {
    center = await resolveCenter(filters.location);
  }

  if (!center) {
    return {
      listings: [],
      total: 0,
      page: filters.page,
      pageSize: filters.pageSize,
      center: null,
      providers: PROVIDERS.map((p) => ({
        source: p.source,
        ok: providerEnabledForRequest(p, filters),
        count: 0,
        note: 'Enter a location to search',
      })),
      cached: false,
      demo: false,
    };
  }

  // 2. Fetch raw provider results (cached).
  const key = rawCacheKey(center, filters);
  let raw = apiCache.get<RawSearch>(key);
  let cached = true;
  if (!raw) {
    cached = false;
    raw = await runProviders(center, filters);
    apiCache.set(key, raw, RAW_TTL_MS);
    cacheListings(raw.listings);
  }

  // 3. Filter → rank → paginate.
  const filtered = applyFilters(raw.listings, filters, center);
  const ranked = rank(filtered, filters, center);

  const total = ranked.length;
  const pageSize = clamp(filters.pageSize, 1, 60);
  const page = Math.max(1, filters.page);
  const start = (page - 1) * pageSize;
  const listings = ranked.slice(start, start + pageSize);

  return {
    listings,
    total,
    page,
    pageSize,
    center,
    providers: raw.providers,
    cached,
    demo: raw.demo,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Resolve a single listing for a detail page. Tries the shared cache first
 * (populated by recent searches), then asks the owning provider to fetch it
 * directly if it supports that. Returns null when neither works — the UI then
 * falls back to any saved snapshot it holds.
 */
export async function resolveListing(id: string): Promise<Listing | null> {
  const cached = getCachedListing(id);
  if (cached) return cached;

  const colon = id.indexOf(':');
  if (colon <= 0) return null;
  const source = id.slice(0, colon) as ListingSource;
  const externalId = id.slice(colon + 1);

  const provider = PROVIDERS.find((p) => p.source === source);
  if (!provider?.getById) return null;
  try {
    const listing = await provider.getById(externalId);
    if (listing) apiCache.set(`homes:listing:${listing.id}`, listing, LISTING_TTL_MS);
    return listing;
  } catch {
    return null;
  }
}

/** Static provider catalogue for the UI (source id + enabled + reason). */
export function providerCatalog(): { source: ListingSource; enabled: boolean; note: string }[] {
  return PROVIDERS.map((p) => ({
    source: p.source,
    enabled: p.isEnabled(),
    note: p.isEnabled() ? 'Enabled' : p.disabledReason(),
  }));
}
