/**
 * RMHHomes — presentation helpers.
 *
 * Client-safe formatting used by both the UI and (occasionally) provider
 * adapters when building human-readable titles.
 */

import type { Listing, ListingSource, ListingType, PropertyType } from './types';

const PROPERTY_LABELS: Record<PropertyType, string> = {
  apartment: 'Apartment',
  house: 'House',
  condo: 'Condo',
  townhouse: 'Townhouse',
  room: 'Room',
  other: 'Property',
};

export function propertyTypeLabel(type: PropertyType): string {
  return PROPERTY_LABELS[type] ?? 'Property';
}

const SOURCE_LABELS: Record<ListingSource, string> = {
  sample: 'RMH Sample',
  craigslist: 'Craigslist',
  rentcast: 'RentCast',
};

export function sourceLabel(source: ListingSource): string {
  return SOURCE_LABELS[source] ?? source;
}

/**
 * Format a price. Rentals render as "$1,850/mo"; sales as "$389,000". `null`
 * prices (common on Craigslist "contact for price" posts) become "Ask".
 */
export function formatPrice(price: number | null, listingType: ListingType): string {
  if (price == null || !Number.isFinite(price) || price <= 0) return 'Ask';
  const formatted = `$${Math.round(price).toLocaleString('en-US')}`;
  return listingType === 'rent' ? `${formatted}/mo` : formatted;
}

/** "Studio", "1 bed", "3 beds". */
export function formatBeds(beds: number | null): string {
  if (beds == null) return '—';
  if (beds === 0) return 'Studio';
  return `${beds} bed${beds === 1 ? '' : 's'}`;
}

/** "1 bath", "2.5 baths". */
export function formatBaths(baths: number | null): string {
  if (baths == null) return '—';
  return `${baths} bath${baths === 1 ? '' : 's'}`;
}

/** "1,200 sqft" or empty string when unknown. */
export function formatSqft(sqft: number | null): string {
  if (sqft == null || sqft <= 0) return '';
  return `${Math.round(sqft).toLocaleString('en-US')} sqft`;
}

/** Compact one-line location, e.g. "Rochester, NY". */
export function formatLocation(listing: Pick<Listing, 'city' | 'state' | 'address'>): string {
  const parts = [listing.city, listing.state].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return listing.address ?? '';
}

/** "3 days ago" style relative time from an ISO string. */
export function formatPostedAt(iso: string | undefined, now: number): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diff = Math.max(0, now - t);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `${months} mo${months === 1 ? '' : 's'} ago`;
}
