/**
 * RMHHomes — RentCast provider (server only).
 *
 * RentCast (https://rentcast.io) offers a real listings API with a free tier
 * (~50 requests/month). It's the "real data" source: when `RENTCAST_API_KEY`
 * is set the provider returns live rental/for-sale listings around the search
 * center; when it's absent the provider disables itself cleanly so the platform
 * keeps working on the free Craigslist + sample sources.
 *
 * Responses are cached aggressively (the free tier is small) at the search
 * layer, so a popular area doesn't burn the monthly quota.
 */

import type { Listing, ListingType, PropertyType } from '../types';
import {
  makeListingId,
  toFiniteNumber,
  type ListingProvider,
  type ProviderContext,
} from './provider';

const BASE = process.env.RENTCAST_API_URL || 'https://api.rentcast.io/v1';

/** RentCast `propertyType` → our normalized category. */
function normalizeType(raw: unknown): PropertyType {
  const t = String(raw ?? '').toLowerCase();
  if (t.includes('single family') || t.includes('single-family')) return 'house';
  if (t.includes('condo')) return 'condo';
  if (t.includes('townhouse') || t.includes('townhome')) return 'townhouse';
  if (t.includes('apartment') || t.includes('multi-family') || t.includes('multi family'))
    return 'apartment';
  return 'other';
}

interface RentCastItem {
  id?: string;
  formattedAddress?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  price?: number;
  listedDate?: string;
  status?: string;
}

function mapItem(item: RentCastItem, listingType: ListingType): Listing {
  const externalId =
    item.id || `${item.latitude ?? ''},${item.longitude ?? ''}:${item.formattedAddress ?? ''}`;
  const beds = toFiniteNumber(item.bedrooms);
  const propertyType = normalizeType(item.propertyType);
  const title =
    `${beds != null ? (beds === 0 ? 'Studio' : `${beds} bed`) : ''} ` +
    `${propertyType === 'other' ? 'home' : propertyType}` +
    `${item.city ? ` in ${item.city}` : ''}`.trim();

  return {
    id: makeListingId('rentcast', externalId),
    source: 'rentcast',
    externalId,
    title: title.replace(/\s+/g, ' ').trim(),
    listingType,
    propertyType,
    price: toFiniteNumber(item.price),
    beds,
    baths: toFiniteNumber(item.bathrooms),
    sqft: toFiniteNumber(item.squareFootage),
    address: item.addressLine1 || item.formattedAddress,
    city: item.city,
    state: item.state,
    postalCode: item.zipCode,
    lat: toFiniteNumber(item.latitude),
    lng: toFiniteNumber(item.longitude),
    petsAllowed: null,
    postedAt: item.listedDate ? new Date(item.listedDate).toISOString() : undefined,
  };
}

export class RentCastProvider implements ListingProvider {
  readonly source = 'rentcast' as const;

  private key(): string | undefined {
    return process.env.RENTCAST_API_KEY?.trim() || undefined;
  }

  isEnabled(): boolean {
    return Boolean(this.key());
  }

  disabledReason(): string {
    return 'Set RENTCAST_API_KEY to enable live RentCast listings';
  }

  async search(ctx: ProviderContext): Promise<Listing[]> {
    const key = this.key();
    if (!key) return [];

    const { filters, center } = ctx;
    const listingType: ListingType = filters.listingType === 'sale' ? 'sale' : 'rent';
    const endpoint = listingType === 'sale' ? '/listings/sale' : '/listings/rental/long-term';

    const url = new URL(BASE + endpoint);
    url.searchParams.set('latitude', String(center.lat));
    url.searchParams.set('longitude', String(center.lng));
    // RentCast radius is in miles; our filter is km.
    const radiusMiles = Math.max(1, Math.round((filters.radiusKm ?? 25) * 0.621371));
    url.searchParams.set('radius', String(radiusMiles));
    url.searchParams.set('status', 'Active');
    url.searchParams.set('limit', '100');
    if (filters.minBeds != null) url.searchParams.set('bedrooms', String(filters.minBeds));

    const res = await fetch(url, {
      headers: { 'X-Api-Key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(9000),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error('RentCast rejected the API key');
    }
    if (res.status === 429) {
      throw new Error('RentCast quota exceeded');
    }
    if (!res.ok) throw new Error(`RentCast returned ${res.status}`);

    const data = (await res.json()) as RentCastItem[] | { listings?: RentCastItem[] };
    const items = Array.isArray(data) ? data : (data.listings ?? []);
    return items.map((item) => mapItem(item, listingType));
  }

  async getById(externalId: string): Promise<Listing | null> {
    void externalId;
    // Detail resolution goes through the search cache / saved snapshot.
    return null;
  }
}
