/**
 * RMHHomes scraper — idempotent seed of default sources.
 *
 * Seeds Craigslist regional feeds for a spread of major US metros, one for
 * rentals (apartments/housing) and one for sales (real estate) each. Re-seeding
 * refreshes labels/defaults but never clobbers an operator's status change
 * (a DISABLED or BLOCKED source stays that way). The homes worker calls this on
 * an empty database so the marketplace has inventory right after deploy.
 */

import type { HomeSourceConfig } from './types';

interface Metro {
  /** Craigslist site subdomain, e.g. "newyork" → newyork.craigslist.org */
  region: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
}

/** A representative spread of large US rental/for-sale markets. */
export const SEED_METROS: Metro[] = [
  { region: 'newyork', city: 'New York', state: 'NY', lat: 40.7128, lng: -74.006 },
  { region: 'losangeles', city: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437 },
  { region: 'chicago', city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 },
  { region: 'sfbay', city: 'San Francisco', state: 'CA', lat: 37.7749, lng: -122.4194 },
  { region: 'seattle', city: 'Seattle', state: 'WA', lat: 47.6062, lng: -122.3321 },
  { region: 'boston', city: 'Boston', state: 'MA', lat: 42.3601, lng: -71.0589 },
  { region: 'washingtondc', city: 'Washington', state: 'DC', lat: 38.9072, lng: -77.0369 },
  { region: 'austin', city: 'Austin', state: 'TX', lat: 30.2672, lng: -97.7431 },
  { region: 'denver', city: 'Denver', state: 'CO', lat: 39.7392, lng: -104.9903 },
  { region: 'atlanta', city: 'Atlanta', state: 'GA', lat: 33.749, lng: -84.388 },
  { region: 'miami', city: 'Miami', state: 'FL', lat: 25.7617, lng: -80.1918 },
  { region: 'rochester', city: 'Rochester', state: 'NY', lat: 43.1566, lng: -77.6088 },
];

const CATEGORIES: { category: string; listingType: 'RENT' | 'SALE'; noun: string }[] = [
  { category: 'apa', listingType: 'RENT', noun: 'Rentals' },
  { category: 'rea', listingType: 'SALE', noun: 'For sale' },
];

type SeedSource = Omit<HomeSourceConfig, 'id'> & { status: 'ACTIVE' };

/** The full set of sources this seed installs (pure — used by tests too). */
export function buildSeedSources(): SeedSource[] {
  const out: SeedSource[] = [];
  for (const m of SEED_METROS) {
    for (const c of CATEGORIES) {
      out.push({
        key: `craigslist:${m.region}:${c.category}`,
        provider: 'CRAIGSLIST',
        label: `Craigslist ${m.city} — ${c.noun}`,
        region: m.region,
        category: c.category,
        url: null,
        listingType: c.listingType,
        defaultCity: m.city,
        defaultState: m.state,
        defaultLat: m.lat,
        defaultLng: m.lng,
        status: 'ACTIVE',
      });
    }
  }
  return out;
}

type AnyRow = Record<string, unknown>;

export interface SeedPrisma {
  homeSource: {
    upsert(args: { where: { key: string }; update: AnyRow; create: AnyRow }): Promise<unknown>;
    count(): Promise<number>;
  };
}

/** Upsert the default sources. Returns how many sources exist afterward. */
export async function seedHomeSources(prisma: SeedPrisma): Promise<{ sources: number }> {
  for (const s of buildSeedSources()) {
    const { status, ...config } = s;
    await prisma.homeSource.upsert({
      where: { key: s.key },
      // Refresh display/config on re-seed, but leave status/errors untouched.
      update: {
        label: config.label,
        provider: config.provider,
        region: config.region,
        category: config.category,
        url: config.url,
        listingType: config.listingType,
        defaultCity: config.defaultCity,
        defaultState: config.defaultState,
        defaultLat: config.defaultLat,
        defaultLng: config.defaultLng,
      },
      create: { ...config, status },
    });
  }
  const sources = await prisma.homeSource.count();
  return { sources };
}
