/**
 * RMHHomes — watch matcher (client-safe, dependency-free).
 *
 * A single source of truth for "does this listing satisfy this watch's
 * criteria?", shared by the API path (watches.server → in-app + push) and the
 * scraper's lightweight notifier. Kept free of server-only imports so neither
 * consumer drags in the other's dependencies.
 */

import { haversineKm } from './distance';

export interface WatchCriteria {
  listingType: 'RENT' | 'SALE' | null;
  propertyTypes: string[];
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  minBeds: number | null;
  minBaths: number | null;
  petsRequired: boolean;
}

export interface MatchableListing {
  listingType: 'RENT' | 'SALE';
  propertyType: string;
  priceCents: number;
  beds: number;
  baths: number;
  petsAllowed: boolean;
  lat: number;
  lng: number;
}

/** Does `listing` satisfy every criterion set on `watch`? */
export function listingMatchesWatch(watch: WatchCriteria, listing: MatchableListing): boolean {
  if (watch.listingType && listing.listingType !== watch.listingType) return false;
  if (watch.propertyTypes.length && !watch.propertyTypes.includes(listing.propertyType)) {
    return false;
  }
  if (watch.minPriceCents != null && listing.priceCents < watch.minPriceCents) return false;
  if (watch.maxPriceCents != null && listing.priceCents > watch.maxPriceCents) return false;
  if (watch.minBeds != null && listing.beds < watch.minBeds) return false;
  if (watch.minBaths != null && listing.baths < watch.minBaths) return false;
  if (watch.petsRequired && !listing.petsAllowed) return false;
  if (watch.lat != null && watch.lng != null && watch.radiusKm != null) {
    const d = haversineKm(
      { lat: watch.lat, lng: watch.lng },
      { lat: listing.lat, lng: listing.lng },
    );
    if (d > watch.radiusKm) return false;
  }
  return true;
}
