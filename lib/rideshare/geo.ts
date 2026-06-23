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

// Pricing constants for the trip fare.
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
  /** Subtotal before the (currently flat) total. */
  subtotalCents: number;
  /** Total fare charged to the rider for the trip (excludes tips). */
  totalCents: number;
}

/**
 * Itemised fare estimate for a trip. `totalCents` is the fare the rider pays
 * for the trip (tips are added separately, after the ride).
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
    totalCents: subtotalCents,
  };
}

/**
 * Estimated fare in cents for a trip. The rider pays this for the trip;
 * tips are added afterwards.
 */
export function estimateFareCents(
  distanceMeters: number | null | undefined,
  classId: string,
  durationSeconds?: number | null,
): number {
  return fareBreakdown(distanceMeters, durationSeconds, classId).subtotalCents;
}

// ─── Driver payout ─────────────────────────────────────────────────────────
//
// When a trip completes the rider's fare is split between the driver, RMH
// Studios (the platform service fee) and a per-trip insurance & safety
// contribution. Tips are passed through to the driver in full.
export const PAYOUT_RATES = {
  serviceFeeRate: 0.2, // RMH Studios' share of the fare
  insuranceRate: 0.06, // insurance & safety contribution
  insuranceMinCents: 100, // minimum insurance per completed trip
} as const;

export interface PayoutBreakdown {
  /** The trip fare the rider paid (excludes tips). */
  fareCents: number;
  /** RMH Studios' platform service fee. */
  serviceFeeCents: number;
  /** Insurance & safety contribution. */
  insuranceCents: number;
  /** Rider tip, paid to the driver in full. */
  tipCents: number;
  /** Fare-only driver earnings (fare − service fee − insurance), before tips. */
  driverBaseCents: number;
  /** Driver's total take-home: fare share + tips. */
  driverEarningsCents: number;
}

/**
 * Splits a completed trip's fare (plus any tip) into the driver's take-home,
 * RMH Studios' service fee, and the insurance contribution.
 */
export function payoutBreakdown(
  fareCents: number | null | undefined,
  tipCents: number | null | undefined = 0,
): PayoutBreakdown {
  const fare = Math.max(0, Math.round(fareCents ?? 0));
  const tip = Math.max(0, Math.round(tipCents ?? 0));
  const serviceFeeCents = Math.round(fare * PAYOUT_RATES.serviceFeeRate);
  const insuranceCents = Math.min(
    Math.max(0, fare - serviceFeeCents),
    Math.max(PAYOUT_RATES.insuranceMinCents, Math.round(fare * PAYOUT_RATES.insuranceRate)),
  );
  const driverBaseCents = Math.max(0, fare - serviceFeeCents - insuranceCents);
  return {
    fareCents: fare,
    serviceFeeCents,
    insuranceCents,
    tipCents: tip,
    driverBaseCents,
    driverEarningsCents: driverBaseCents + tip,
  };
}

/** Suggested tip amounts (in cents) for a completed trip, plus a "no tip" option. */
export const TIP_PERCENTS = [0, 0.1, 0.15, 0.2] as const;

export function suggestedTipCents(fareCents: number, percent: number): number {
  return Math.round(fareCents * percent);
}

/** Maximum tip we accept, to guard against fat-fingered amounts. */
export const MAX_TIP_CENTS = 50_000;

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
