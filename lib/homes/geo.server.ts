/**
 * RMHHomes — geocoding + geo math (server only).
 *
 * Turns free-text locations ("Rochester, NY") into coordinates via the free,
 * key-less OpenStreetMap Nominatim service, and provides the haversine helper
 * used to filter/rank listings by distance from the search center. Results are
 * cached because Nominatim's usage policy asks callers to be gentle.
 */

import { apiCache } from '@/lib/cache';
import type { SearchCenter } from './types';

// Re-exported for callers that historically imported it from here; the
// implementation now lives in the dependency-free ./distance module.
export { haversineKm } from './distance';

const USER_AGENT =
  process.env.HOMES_USER_AGENT || 'RMHHomes/1.0 (https://rmhstudios.com; homes@rmhstudios.com)';

const NOMINATIM_BASE = process.env.OSM_NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

const GEOCODE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — place coordinates are stable.

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

interface NominatimItem {
  display_name?: string;
  lat?: string;
  lon?: string;
}

/** Forward-geocode free text into candidate places (for the location picker). */
export async function geocode(query: string, limit = 5): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const cacheKey = `homes:geocode:${q.toLowerCase()}:${limit}`;
  const cached = apiCache.get<GeocodeResult[]>(cacheKey);
  if (cached) return cached;

  const url = new URL('/search', NOMINATIM_BASE);
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '0');
  url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 10)));

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Nominatim error ${res.status}`);

  const data = (await res.json()) as NominatimItem[];
  const results = data
    .map((item) => ({
      label: item.display_name ?? '',
      lat: item.lat ? Number(item.lat) : NaN,
      lng: item.lon ? Number(item.lon) : NaN,
    }))
    .filter((r) => r.label && Number.isFinite(r.lat) && Number.isFinite(r.lng));

  apiCache.set(cacheKey, results, GEOCODE_TTL_MS);
  return results;
}

/** Resolve a search's `location` string to a single center, or null. */
export async function resolveCenter(location: string): Promise<SearchCenter | null> {
  const results = await geocode(location, 1);
  const top = results[0];
  if (!top) return null;
  return { lat: top.lat, lng: top.lng, label: top.label };
}
