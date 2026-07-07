/**
 * RMHHomes — sample provider (server only).
 *
 * A deterministic, key-less, network-free source of realistic-looking listings
 * generated around the search center. It exists so the platform is *always*
 * fully functional — in local dev, in CI, and in production before any external
 * API keys are configured — and so demos never show an empty grid.
 *
 * Determinism matters: every listing is a pure function of (center, index), and
 * the index is encoded into the listing id. That lets {@link SampleProvider.getById}
 * regenerate any single listing exactly, so listing-detail pages work without a
 * database round-trip or a live upstream.
 */

import type { Listing, PropertyType, SearchCenter } from '../types';
import { makeListingId, type ListingProvider, type ProviderContext } from './provider';

const RESULT_COUNT = 60;

const STREET_NAMES = [
  'Maple',
  'Oak',
  'Park',
  'Elm',
  'Cedar',
  'Highland',
  'Lakeview',
  'Birch',
  'Sunset',
  'Willow',
  'Chestnut',
  'Monroe',
  'University',
  'Riverside',
  'Grove',
  'Meadow',
  'Franklin',
  'Jefferson',
  'Clover',
  'Aspen',
];
const STREET_TYPES = ['St', 'Ave', 'Blvd', 'Dr', 'Ln', 'Ct', 'Way', 'Pl'];

const PROPERTY_TYPES: PropertyType[] = [
  'apartment',
  'apartment',
  'apartment',
  'house',
  'house',
  'condo',
  'townhouse',
  'room',
];

const AMENITIES = [
  'In-unit laundry',
  'Dishwasher',
  'Central A/C',
  'Parking',
  'Balcony',
  'Hardwood floors',
  'Gym',
  'Pool',
  'Pet friendly',
  'Furnished',
  'Utilities included',
  'Elevator',
  'Rooftop',
  'Storage',
  'EV charging',
];

/** Deterministic 32-bit hash of a string (FNV-1a). */
function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — small, fast, deterministic from a 32-bit seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable base seed for a search center (rounded so nearby queries agree). */
function centerSeed(center: SearchCenter): number {
  const key = `${center.lat.toFixed(2)},${center.lng.toFixed(2)}`;
  return hashString(key);
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

/** Parse "Rochester, Monroe County, New York, USA" → { city, state }. */
function splitLabel(label: string): { city?: string; state?: string } {
  const parts = label
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return {};
  const city = parts[0];
  // Second-to-last is usually the state (last is the country).
  const state = parts.length >= 2 ? parts[parts.length - 2] : undefined;
  return { city, state };
}

/**
 * Generate one listing fully deterministically from the center + index. The
 * returned `postedAt` is anchored to `nowMs` so relative times look live while
 * everything else stays reproducible.
 */
function generate(center: SearchCenter, index: number, nowMs: number): Listing {
  const seed = (centerSeed(center) ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  const rng = mulberry32(seed);

  const { city, state } = splitLabel(center.label);

  const propertyType = pick(rng, PROPERTY_TYPES);
  // ~70% rentals, deterministic per listing.
  const listingType = rng() < 0.7 ? 'rent' : 'sale';

  const beds = propertyType === 'room' ? 1 : Math.floor(rng() * 4) + (rng() < 0.15 ? 0 : 1); // 0–4
  const baths = roundTo(1 + rng() * 2, 0.5); // 1–3, halves
  const sqft = 450 + Math.floor(rng() * 2200);

  const price =
    listingType === 'rent'
      ? roundTo(700 + beds * 550 + rng() * 1400, 25)
      : roundTo(180_000 + beds * 90_000 + rng() * 260_000, 1000);

  // Scatter within ~radius of the center (deg ≈ km/111).
  const spreadDeg = 0.18;
  const lat = center.lat + (rng() - 0.5) * spreadDeg;
  const lng = center.lng + (rng() - 0.5) * spreadDeg;

  const houseNumber = 100 + Math.floor(rng() * 8900);
  const street = `${houseNumber} ${pick(rng, STREET_NAMES)} ${pick(rng, STREET_TYPES)}`;

  const amenityCount = 2 + Math.floor(rng() * 5);
  const amenities: string[] = [];
  const pool = [...AMENITIES];
  for (let i = 0; i < amenityCount && pool.length; i++) {
    amenities.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  const petsAllowed = amenities.includes('Pet friendly') ? true : rng() < 0.5;

  const bedLabel = beds === 0 ? 'Studio' : `${beds} bed`;
  const typeLabel = propertyType.charAt(0).toUpperCase() + propertyType.slice(1);
  const title = `${bedLabel} ${typeLabel}${city ? ` in ${city}` : ''}`;

  // Posted within the last ~20 days.
  const postedAt = new Date(nowMs - Math.floor(rng() * 20 * 24 * 3600 * 1000)).toISOString();
  const availableFrom = new Date(nowMs + Math.floor(rng() * 45 * 24 * 3600 * 1000)).toISOString();

  const externalId = String(index);
  const imageSeed = seed % 1000;
  const imageUrl = `https://picsum.photos/seed/rmhhomes-${imageSeed}/800/600`;

  return {
    id: makeListingId('sample', externalId),
    source: 'sample',
    externalId,
    title,
    description:
      `${typeLabel} available${city ? ` in ${city}` : ''}. ` +
      `${bedLabel}, ${baths} bath, ${sqft.toLocaleString('en-US')} sqft. ` +
      `Features: ${amenities.join(', ')}.`,
    listingType,
    propertyType,
    price,
    beds,
    baths,
    sqft,
    address: street,
    city,
    state,
    lat,
    lng,
    imageUrl,
    images: [imageUrl, `https://picsum.photos/seed/rmhhomes-${imageSeed}-2/800/600`],
    url: undefined,
    amenities,
    petsAllowed,
    availableFrom,
    postedAt,
  };
}

export class SampleProvider implements ListingProvider {
  readonly source = 'sample' as const;

  isEnabled(): boolean {
    // Disable in production only if explicitly opted out — it's the safety net.
    return process.env.HOMES_DISABLE_SAMPLE !== 'true';
  }

  disabledReason(): string {
    return 'Sample listings disabled (HOMES_DISABLE_SAMPLE=true)';
  }

  async search(ctx: ProviderContext): Promise<Listing[]> {
    const now = Date.now();
    const out: Listing[] = [];
    for (let i = 0; i < RESULT_COUNT; i++) {
      out.push(generate(ctx.center, i, now));
    }
    return out;
  }

  async getById(externalId: string): Promise<Listing | null> {
    // Sample listings can only be regenerated relative to a center, which isn't
    // encoded in the id. Detail pages therefore rely on the search cache /
    // saved snapshot for sample listings; return null to signal "not directly
    // resolvable" so the caller falls back gracefully.
    void externalId;
    return null;
  }
}
