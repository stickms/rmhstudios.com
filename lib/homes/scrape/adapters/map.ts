/**
 * RMHHomes scraper — shared feed-item → NormalizedListing mapping.
 *
 * Craigslist and generic RSS differ only in how they build the feed URL and
 * derive a stable id; the field-by-field mapping (price/beds/baths/geo/images)
 * is identical, so it lives here and both adapters call it.
 */

import type { FeedItem } from '../feed';
import { pickField } from '../feed';
import {
  cleanTitle,
  extractBaths,
  extractBeds,
  extractPetsAllowed,
  extractPrice,
  extractPropertyType,
  extractSqft,
  neighborhoodFromTitle,
} from '../extract';
import type { NormalizedListing } from '../types';

function toNumber(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDate(v: string | null): Date | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t) : null;
}

function stripHtml(html: string | null): string {
  return html
    ? html
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}

/**
 * Map one parsed feed item to a normalized listing. Returns null when the item
 * has no usable URL or title (nothing worth persisting).
 */
export function mapFeedItem(item: FeedItem, externalId: string): NormalizedListing | null {
  const { fields } = item;
  const url = pickField(fields, ['link', 'guid', 'dc:source']);
  const rawTitle = pickField(fields, ['title']);
  if (!url || !rawTitle || !externalId) return null;

  const descriptionHtml = pickField(fields, [
    'description',
    'content:encoded',
    'summary',
    'content',
  ]);
  const text = `${rawTitle} ${stripHtml(descriptionHtml)}`;

  const lat = toNumber(pickField(fields, ['geo:lat', 'geo:latitude']));
  const lng = toNumber(pickField(fields, ['geo:long', 'geo:lng', 'geo:longitude']));

  return {
    externalId,
    title: cleanTitle(rawTitle),
    descriptionHtml,
    url,
    price: extractPrice(text),
    beds: extractBeds(text),
    baths: extractBaths(text),
    sqft: extractSqft(text),
    propertyType: extractPropertyType(text),
    petsAllowed: extractPetsAllowed(text),
    locationRaw: neighborhoodFromTitle(rawTitle),
    lat: lat != null && lng != null ? lat : null,
    lng: lat != null && lng != null ? lng : null,
    imageUrls: item.imageUrls.slice(0, 12),
    postedAt: toDate(pickField(fields, ['dc:date', 'pubdate', 'updated', 'lastbuilddate'])),
  };
}
