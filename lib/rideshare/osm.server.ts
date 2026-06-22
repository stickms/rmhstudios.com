/**
 * RMH Rideshare — OpenStreetMap integration (server only).
 *
 * Uses the public OSM Nominatim geocoder and the OSRM routing service. Both
 * are free, key-less services with usage policies, so requests are made
 * server-side with a descriptive User-Agent and the results are simple to
 * cache/rate-limit at the route layer.
 */

import { haversineMeters, type LatLng } from './geo';

const USER_AGENT =
  'RMHRideshare/1.0 (https://rmhstudios.com; rideshare@rmhstudios.com)';

const NOMINATIM_BASE =
  process.env.OSM_NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
const OSRM_BASE =
  process.env.OSM_OSRM_URL || 'https://router.project-osrm.org';

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

/** Forward-geocode a free-text address query into candidate places. */
export async function geocode(query: string, limit = 5): Promise<GeocodeResult[]> {
  const url = new URL('/search', NOMINATIM_BASE);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '0');
  url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 10)));

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`Nominatim error ${res.status}`);
  }
  const data = (await res.json()) as NominatimItem[];
  return data
    .map((item) => ({
      label: item.display_name ?? '',
      lat: item.lat ? Number(item.lat) : NaN,
      lng: item.lon ? Number(item.lon) : NaN,
    }))
    .filter((r) => r.label && Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

/** Reverse-geocode a coordinate into a human-readable address label. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const url = new URL('/reverse', NOMINATIM_BASE);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('zoom', '18');

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`Nominatim reverse error ${res.status}`);
  }
  const data = (await res.json()) as { display_name?: string };
  return data.display_name ?? null;
}

export interface RouteEstimate {
  distanceMeters: number;
  durationSeconds: number;
  /** True when the OSRM road route was used; false for straight-line fallback. */
  precise: boolean;
  /**
   * Road geometry as an ordered list of `[lng, lat]` pairs, ready to drop into
   * a GeoJSON `LineString`. Present only for precise OSRM routes; the
   * straight-line fallback omits it (the two endpoints are enough to draw a
   * line). Decimated to a reasonable size so it's cheap to ship to the client.
   */
  geometry?: [number, number][];
}

/**
 * Driving distance/duration between two points, plus the road geometry for
 * drawing the route on a map. Falls back to a straight-line estimate (with an
 * assumed average speed) if OSRM is unreachable, so a ride can always be quoted.
 *
 * Pass `withGeometry: false` to skip the polyline when only the numbers are
 * needed (e.g. quoting a fare).
 */
export async function routeEstimate(
  pickup: LatLng,
  dropoff: LatLng,
  withGeometry = true,
): Promise<RouteEstimate> {
  try {
    const coords = `${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}`;
    const url = new URL(`/route/v1/driving/${coords}`, OSRM_BASE);
    url.searchParams.set('overview', withGeometry ? 'full' : 'false');
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('alternatives', 'false');

    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        routes?: {
          distance?: number;
          duration?: number;
          geometry?: { coordinates?: [number, number][] };
        }[];
      };
      const route = data.routes?.[0];
      if (route && typeof route.distance === 'number' && typeof route.duration === 'number') {
        const coordinates = route.geometry?.coordinates;
        return {
          distanceMeters: Math.round(route.distance),
          durationSeconds: Math.round(route.duration),
          precise: true,
          geometry:
            withGeometry && Array.isArray(coordinates) && coordinates.length > 1
              ? decimate(coordinates, 400)
              : undefined,
        };
      }
    }
  } catch {
    // fall through to straight-line estimate
  }

  const straight = haversineMeters(pickup, dropoff);
  // Roads are rarely straight; pad ~25%. Assume ~30 km/h average city speed.
  const distanceMeters = Math.round(straight * 1.25);
  const durationSeconds = Math.round((distanceMeters / 1000 / 30) * 3600);
  return { distanceMeters, durationSeconds, precise: false };
}

/** Evenly thin a coordinate list down to at most `max` points (keeps ends). */
function decimate(coords: [number, number][], max: number): [number, number][] {
  if (coords.length <= max) return coords;
  const step = (coords.length - 1) / (max - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < max; i++) out.push(coords[Math.round(i * step)]);
  return out;
}
