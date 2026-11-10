/**
 * Contracts for the bodyless /api/rideshare/** calls (redesign audit C1, batch 6):
 * driver earnings and saved places. The ride endpoints parse their own bodies
 * with bespoke messages and stay raw fetches. Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';

export interface DriverRecentTrip {
  id: string;
  rideClass: string;
  pickupLabel: string;
  dropoffLabel: string;
  distanceMeters: number | null;
  estimatedFareCents: number;
  tipCents: number;
  driverEarningsCents: number;
  completedAt: string | null;
  ratingByRider: number | null;
}

export interface DriverEarningsView {
  totalTrips: number;
  totalDistanceMeters: number;
  grossFaresCents: number;
  tipsCents: number;
  serviceFeeCents: number;
  insuranceCents: number;
  weekTrips: number;
  weekEarningsCents: number;
  earningsCents: number;
  ratingCount: number;
  ratingAvg: number | null;
  recent: DriverRecentTrip[];
}

/** Approved drivers only (403 otherwise). */
export const getDriverEarningsApi = endpoint<{ res: DriverEarningsView }>()({
  method: 'GET',
  path: '/api/rideshare/earnings',
});

export interface SavedPlaceView {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
}

export const listSavedPlacesApi = endpoint<{ res: { places: SavedPlaceView[] } }>()({
  method: 'GET',
  path: '/api/rideshare/places',
});

export const deleteSavedPlaceApi = endpoint<{ res: { ok: true } }>()({
  method: 'DELETE',
  path: '/api/rideshare/places/$id',
});
