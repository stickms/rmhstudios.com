/**
 * RMHHomes — presentation helpers (client-safe).
 */

import type { Listing, ListingStatus, ListingType, PropertyType } from './types';

const PROPERTY_LABELS: Record<PropertyType, string> = {
  APARTMENT: 'Apartment',
  HOUSE: 'House',
  CONDO: 'Condo',
  TOWNHOUSE: 'Townhouse',
  ROOM: 'Room',
  OTHER: 'Property',
};

export function propertyTypeLabel(type: PropertyType): string {
  return PROPERTY_LABELS[type] ?? 'Property';
}

export function listingTypeLabel(type: ListingType): string {
  return type === 'RENT' ? 'For rent' : 'For sale';
}

const STATUS_LABELS: Record<ListingStatus, string> = {
  ACTIVE: 'Active',
  RENTED: 'Rented',
  SOLD: 'Sold',
  REMOVED: 'Removed',
};

export function statusLabel(status: ListingStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/** "$1,850/mo" for rentals, "$389,000" for sales. */
export function formatPrice(price: number, listingType: ListingType): string {
  if (!Number.isFinite(price) || price <= 0) return 'Contact for price';
  const formatted = `$${Math.round(price).toLocaleString('en-US')}`;
  return listingType === 'RENT' ? `${formatted}/mo` : formatted;
}

export function formatBeds(beds: number | null): string {
  if (beds == null) return '—';
  if (beds === 0) return 'Studio';
  return `${beds} bed${beds === 1 ? '' : 's'}`;
}

export function formatBaths(baths: number | null): string {
  if (baths == null) return '—';
  const n = Number.isInteger(baths) ? String(baths) : baths.toFixed(1);
  return `${n} bath${baths === 1 ? '' : 's'}`;
}

export function formatSqft(sqft: number | null): string {
  if (sqft == null || sqft <= 0) return '';
  return `${Math.round(sqft).toLocaleString('en-US')} sqft`;
}

export function formatLocation(listing: Pick<Listing, 'city' | 'state'>): string {
  return [listing.city, listing.state].filter(Boolean).join(', ');
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

/** A short "available from" label, e.g. "Available Aug 1". */
export function formatAvailable(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const now = Date.now();
  if (t <= now) return 'Available now';
  return `Available ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/** Curated amenity suggestions shown as toggles on the post form. */
export const AMENITY_OPTIONS = [
  'In-unit laundry',
  'Dishwasher',
  'Central A/C',
  'Heating',
  'Parking',
  'Garage',
  'Balcony',
  'Hardwood floors',
  'Gym',
  'Pool',
  'Furnished',
  'Utilities included',
  'Elevator',
  'Wheelchair accessible',
  'Rooftop',
  'Storage',
  'EV charging',
  'Backyard',
];
