/**
 * RMH Rideshare — geo helpers (client + server safe).
 */

import { getRideClass } from './classes';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RidePlace extends LatLng {
  /** Human-readable label from the geocoder. */
  label: string;
}

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in metres between two coordinates. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidLatLng(p: { lat?: unknown; lng?: unknown }): p is LatLng {
  return (
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lng >= -180 &&
    p.lng <= 180
  );
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null) return '—';
  const km = meters / 1000;
  if (km < 1) return `${Math.round(meters)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// Pricing constants for the (currently waived) fare estimate.
export const FARE_RATES = {
  baseCents: 250, // flag-fall
  perKmCents: 120, // distance rate
  perMinCents: 22, // time rate
  minimumCents: 400, // minimum fare
} as const;

export interface FareBreakdown {
  baseCents: number;
  distanceCents: number;
  timeCents: number;
  multiplier: number;
  /** What the trip would have cost before the free-ride promotion. */
  subtotalCents: number;
  /** Amount actually charged — always 0 while rides are free. */
  totalCents: number;
}

/**
 * Itemised fare estimate for a trip. Rides are FREE, so `totalCents` is always
 * 0; `subtotalCents` is the indicative value shown struck-through.
 */
export function fareBreakdown(
  distanceMeters: number | null | undefined,
  durationSeconds: number | null | undefined,
  classId: string,
): FareBreakdown {
  const cls = getRideClass(classId);
  const multiplier = cls?.fareMultiplier ?? 1;
  const km = (distanceMeters ?? 0) / 1000;
  const minutes = (durationSeconds ?? 0) / 60;

  const distanceCents = FARE_RATES.perKmCents * km;
  const timeCents = FARE_RATES.perMinCents * minutes;
  const raw = (FARE_RATES.baseCents + distanceCents + timeCents) * multiplier;
  const subtotalCents = Math.max(FARE_RATES.minimumCents, Math.round(raw));

  return {
    baseCents: Math.round(FARE_RATES.baseCents * multiplier),
    distanceCents: Math.round(distanceCents * multiplier),
    timeCents: Math.round(timeCents * multiplier),
    multiplier,
    subtotalCents,
    totalCents: 0,
  };
}

/**
 * Indicative fare in cents for a trip (the struck-through subtotal). Rides are
 * currently FREE; this is only shown to communicate the value of the promotion.
 */
export function estimateFareCents(
  distanceMeters: number | null | undefined,
  classId: string,
  durationSeconds?: number | null,
): number {
  return fareBreakdown(distanceMeters, durationSeconds, classId).subtotalCents;
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * OpenStreetMap embed URL framing all provided points, with a single marker.
 * Uses the no-API-key OSM export embed (which supports one marker), so we mark
 * the driver's live position when available, otherwise the pickup.
 */
export function osmEmbedUrl(
  pickup: LatLng,
  dropoff: LatLng,
  markerOverride?: LatLng | null,
): string {
  const pad = 0.01;
  const points = [pickup, dropoff, ...(markerOverride ? [markerOverride] : [])];
  const minLat = Math.min(...points.map((p) => p.lat)) - pad;
  const maxLat = Math.max(...points.map((p) => p.lat)) + pad;
  const minLng = Math.min(...points.map((p) => p.lng)) - pad;
  const maxLng = Math.max(...points.map((p) => p.lng)) + pad;
  const bbox = `${minLng},${minLat},${maxLng},${maxLat}`;
  const marker = markerOverride ?? pickup;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    bbox,
  )}&layer=mapnik&marker=${encodeURIComponent(`${marker.lat},${marker.lng}`)}`;
}
