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

/**
 * Indicative fare in cents for a trip. Rides are currently FREE, so this is
 * only shown struck-through to communicate the value of the promotion.
 * Base flag-fall + per-km rate, scaled by the ride class multiplier.
 */
export function estimateFareCents(
  distanceMeters: number | null | undefined,
  classId: string,
): number {
  if (!distanceMeters) return 0;
  const cls = getRideClass(classId);
  const multiplier = cls?.fareMultiplier ?? 1;
  const baseCents = 250; // flag-fall
  const perKmCents = 120;
  const km = distanceMeters / 1000;
  return Math.round((baseCents + perKmCents * km) * multiplier);
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * OpenStreetMap embed URL showing the area covering both points, with a
 * marker at the pickup. Uses the no-API-key OSM export embed.
 */
export function osmEmbedUrl(pickup: LatLng, dropoff: LatLng): string {
  const pad = 0.01;
  const minLat = Math.min(pickup.lat, dropoff.lat) - pad;
  const maxLat = Math.max(pickup.lat, dropoff.lat) + pad;
  const minLng = Math.min(pickup.lng, dropoff.lng) - pad;
  const maxLng = Math.max(pickup.lng, dropoff.lng) + pad;
  const bbox = `${minLng},${minLat},${maxLng},${maxLat}`;
  const marker = `${pickup.lat},${pickup.lng}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    bbox,
  )}&layer=mapnik&marker=${encodeURIComponent(marker)}`;
}
