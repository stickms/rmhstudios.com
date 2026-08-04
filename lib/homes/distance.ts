/**
 * RMHHomes — great-circle distance (client-safe, dependency-free).
 *
 * Pulled out of geo.server so the pure haversine helper can be shared by the
 * radius search, the watch matcher, and the scraper's lightweight notifier
 * without dragging in the geocoder's cache/network imports.
 *
 * ─────────────────────────── on "distance", not "commute" ───────────────────
 *
 * This module measures STRAIGHT-LINE distance and nothing else. It is not a
 * travel-time estimate and the UI must never present it as one: a river, a
 * one-way grid or a missing bridge routinely turns 3 km as-the-crow-flies into
 * a 25-minute drive. Every label this feature renders says "distance" and
 * "straight line", because a number a renter plans their morning around must
 * not be a guess wearing a clock's clothes.
 *
 * A real routing provider (drive/transit/bike/walk isochrones) is a future
 * possibility, and `DistanceProvider` is the seam it would arrive through:
 * implement the interface, register it in place of `straightLineProvider`, and
 * every caller keeps working because it already reads `method` off the result
 * to decide what to call the number. The interface is deliberately
 * batch-and-async — a network router prices per origin→many-destinations
 * request, and a per-listing sync call would be the wrong shape to retrofit.
 * Anything routed would also need `lib/ssrf-guard.server` and aggressive
 * caching (listing coordinates barely move), which is why it would live behind
 * a server module rather than here.
 */

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in kilometers between two coordinates. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* -------------------------------------------------------------------------- */
/* The provider seam                                                          */
/* -------------------------------------------------------------------------- */

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * How a distance was arrived at. The UI branches on this for its wording, so a
 * routed provider added later cannot silently inherit the crow-flies caveat —
 * or lose it.
 */
export type DistanceMethod = 'straight-line' | 'drive' | 'transit' | 'bike' | 'walk';

export interface DistanceEstimate {
  km: number;
  method: DistanceMethod;
  /**
   * Travel minutes, when the method actually knows them. `null` for
   * `straight-line`, which is the whole point: there is no honest way to turn a
   * chord across a map into a duration.
   */
  minutes: number | null;
}

export interface DistanceProvider {
  /** Stable identifier, useful in logs and in the "how was this measured" line. */
  readonly id: string;
  readonly method: DistanceMethod;
  /**
   * Measure one origin against many destinations. Async and batched so a
   * network router drops in without changing any call site.
   */
  measure(origin: LatLng, destinations: readonly LatLng[]): Promise<DistanceEstimate[]>;
}

/**
 * The only provider that ships today. Pure arithmetic, no network, no key —
 * which is why the distance filter can run entirely in the browser over the
 * listings already on screen.
 */
export const straightLineProvider: DistanceProvider = {
  id: 'haversine',
  method: 'straight-line',
  async measure(origin, destinations) {
    return destinations.map((d) => ({
      km: haversineKm(origin, d),
      method: 'straight-line' as const,
      minutes: null,
    }));
  },
};

/**
 * The synchronous fast path the client filter uses. Kept separate from the
 * provider interface on purpose: filtering a grid of 24 listings on every
 * slider tick should not allocate a promise per frame, and straight-line
 * distance is the one method that can answer instantly.
 */
export function straightLineKm(a: LatLng, b: LatLng): number {
  return haversineKm(a, b);
}

/* -------------------------------------------------------------------------- */
/* Units + formatting                                                         */
/* -------------------------------------------------------------------------- */

export type DistanceUnit = 'km' | 'mi';

export const KM_PER_MILE = 1.609344;

export function kmToMiles(km: number): number {
  return km / KM_PER_MILE;
}

export function milesToKm(mi: number): number {
  return mi * KM_PER_MILE;
}

/**
 * A short display string: `"2.4 km"`, `"0.9 mi"`, `"12 km"`.
 *
 * Precision drops as the number grows because a tenth of a kilometre is
 * meaningful at walking range and noise at 40 km. Non-finite input formats as
 * an em dash rather than `NaN`.
 */
export function formatDistance(km: number, unit: DistanceUnit = 'mi'): string {
  if (!Number.isFinite(km) || km < 0) return '—';
  const value = unit === 'mi' ? kmToMiles(km) : km;
  if (value < 0.1) return `< 0.1 ${unit}`;
  const rounded = value < 10 ? value.toFixed(1) : String(Math.round(value));
  return `${rounded} ${unit}`;
}

/** Whether `b` sits within `maxKm` of `a`. A non-positive radius matches nothing. */
export function withinKm(a: LatLng, b: LatLng, maxKm: number): boolean {
  if (!Number.isFinite(maxKm) || maxKm <= 0) return false;
  return haversineKm(a, b) <= maxKm;
}

export interface NearestResult<P extends LatLng> {
  place: P;
  km: number;
}

/**
 * The closest of several saved places to a point, or `null` when there are
 * none. Used to label a listing card with "1.2 mi from Work" without the caller
 * re-deriving which place won.
 */
export function nearestPlace<P extends LatLng>(
  point: LatLng,
  places: readonly P[],
): NearestResult<P> | null {
  let best: NearestResult<P> | null = null;
  for (const place of places) {
    const km = haversineKm(point, place);
    if (!best || km < best.km) best = { place, km };
  }
  return best;
}
