/**
 * RMHHomes scraper — assessment: NormalizedListing → persistable fields.
 *
 * Turns a raw feed listing into the concrete column values a HomeListing row
 * needs, filling gaps with sensible defaults and the source's configured
 * location. Returns null when the listing can't be placed on the map (no
 * coordinates from the feed and no source default) — those are dropped rather
 * than pinned at (0,0). Pure and side-effect free so it can be unit-tested.
 */

import type { PropertyType } from '../types';
import type { HomeSourceConfig, NormalizedListing } from './types';

export interface AssessedListing {
  externalId: string;
  externalUrl: string;
  sourceName: string;
  listingType: 'RENT' | 'SALE';
  propertyType: PropertyType;
  title: string;
  description: string;
  priceCents: number;
  beds: number;
  baths: number;
  sqft: number | null;
  petsAllowed: boolean;
  city: string;
  state: string;
  lat: number;
  lng: number;
  images: string[];
  postedAt: Date | null;
}

function stripHtml(html: string | null): string {
  return html
    ? html
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}

export function assessListing(
  normalized: NormalizedListing,
  source: HomeSourceConfig,
): AssessedListing | null {
  // Coordinates: the listing's own, else the source's regional center. No
  // coordinates at all → we can't map it, so skip.
  const lat = normalized.lat ?? source.defaultLat;
  const lng = normalized.lng ?? source.defaultLng;
  if (lat == null || lng == null) return null;

  const title = normalized.title.trim().slice(0, 120);
  if (title.length < 3) return null;

  const description = (stripHtml(normalized.descriptionHtml) || title).slice(0, 4000);

  const propertyType: PropertyType =
    normalized.propertyType ?? (source.listingType === 'RENT' ? 'APARTMENT' : 'HOUSE');

  const city =
    source.defaultCity?.trim() || normalized.locationRaw?.trim().slice(0, 120) || 'Unknown';
  const state = source.defaultState?.trim().slice(0, 64) || '';

  return {
    externalId: normalized.externalId,
    externalUrl: normalized.url.slice(0, 1000),
    sourceName: source.label.slice(0, 120),
    listingType: source.listingType,
    propertyType,
    title,
    description,
    priceCents: Math.round(Math.max(0, normalized.price ?? 0) * 100),
    beds: normalized.beds != null ? Math.max(0, Math.round(normalized.beds)) : 0,
    baths: normalized.baths != null ? Math.max(0, normalized.baths) : 1,
    sqft: normalized.sqft != null && normalized.sqft > 0 ? Math.round(normalized.sqft) : null,
    petsAllowed: normalized.petsAllowed ?? false,
    city,
    state,
    lat,
    lng,
    images: normalized.imageUrls.slice(0, 12),
    postedAt: normalized.postedAt,
  };
}
