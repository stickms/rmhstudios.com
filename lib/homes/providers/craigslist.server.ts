/**
 * RMHHomes — Craigslist provider (server only).
 *
 * Craigslist exposes a public RSS feed on every housing search result page
 * (`.../search/apa?format=rss`). No key, no scraping of HTML — we read the same
 * structured feed a feed reader would. Each metro is a separate subdomain, so
 * we map the search center to the nearest known Craigslist site (or honor an
 * explicit `HOMES_CRAIGSLIST_SITE` override). If the center isn't near a known
 * site, the provider disables itself with an informative reason rather than
 * guessing a wrong subdomain.
 *
 * Craigslist rate-limits and may return 403 to server clients; those surface as
 * a per-provider error status and never break the overall search — the sample
 * and (optional) RentCast providers still return results.
 */

import type { Listing, ListingType, PropertyType, SearchCenter } from '../types';
import { haversineKm } from '../geo.server';
import { makeListingId, type ListingProvider, type ProviderContext } from './provider';

const USER_AGENT =
  process.env.HOMES_USER_AGENT || 'RMHHomes/1.0 (https://rmhstudios.com; homes@rmhstudios.com)';

/** Nearest-metro threshold. Beyond this, we can't pick a sensible CL site. */
const MAX_SITE_DISTANCE_KM = 160;

/** A compact map of major US Craigslist metros → subdomain + coordinates. */
const CRAIGSLIST_SITES: { site: string; lat: number; lng: number }[] = [
  { site: 'newyork', lat: 40.7128, lng: -74.006 },
  { site: 'losangeles', lat: 34.0522, lng: -118.2437 },
  { site: 'chicago', lat: 41.8781, lng: -87.6298 },
  { site: 'houston', lat: 29.7604, lng: -95.3698 },
  { site: 'phoenix', lat: 33.4484, lng: -112.074 },
  { site: 'philadelphia', lat: 39.9526, lng: -75.1652 },
  { site: 'sfbay', lat: 37.7749, lng: -122.4194 },
  { site: 'dallas', lat: 32.7767, lng: -96.797 },
  { site: 'austin', lat: 30.2672, lng: -97.7431 },
  { site: 'seattle', lat: 47.6062, lng: -122.3321 },
  { site: 'boston', lat: 42.3601, lng: -71.0589 },
  { site: 'washingtondc', lat: 38.9072, lng: -77.0369 },
  { site: 'atlanta', lat: 33.749, lng: -84.388 },
  { site: 'miami', lat: 25.7617, lng: -80.1918 },
  { site: 'denver', lat: 39.7392, lng: -104.9903 },
  { site: 'portland', lat: 45.5152, lng: -122.6784 },
  { site: 'sandiego', lat: 32.7157, lng: -117.1611 },
  { site: 'minneapolis', lat: 44.9778, lng: -93.265 },
  { site: 'detroit', lat: 42.3314, lng: -83.0458 },
  { site: 'rochester', lat: 43.1566, lng: -77.6088 },
  { site: 'buffalo', lat: 42.8864, lng: -78.8784 },
  { site: 'pittsburgh', lat: 40.4406, lng: -79.9959 },
  { site: 'columbus', lat: 39.9612, lng: -82.9988 },
  { site: 'nashville', lat: 36.1627, lng: -86.7816 },
  { site: 'raleigh', lat: 35.7796, lng: -78.6382 },
  { site: 'charlotte', lat: 35.2271, lng: -80.8431 },
  { site: 'orlando', lat: 28.5383, lng: -81.3792 },
  { site: 'tampa', lat: 27.9506, lng: -82.4572 },
  { site: 'sacramento', lat: 38.5816, lng: -121.4944 },
  { site: 'lasvegas', lat: 36.1699, lng: -115.1398 },
  { site: 'saltlakecity', lat: 40.7608, lng: -111.891 },
  { site: 'kansascity', lat: 39.0997, lng: -94.5786 },
  { site: 'stlouis', lat: 38.627, lng: -90.1994 },
  { site: 'cincinnati', lat: 39.1031, lng: -84.512 },
  { site: 'cleveland', lat: 41.4993, lng: -81.6944 },
  { site: 'indianapolis', lat: 39.7684, lng: -86.1581 },
  { site: 'milwaukee', lat: 43.0389, lng: -87.9065 },
  { site: 'albany', lat: 42.6526, lng: -73.7562 },
  { site: 'syracuse', lat: 43.0481, lng: -76.1474 },
];

function pickSite(center: SearchCenter): { site: string; distanceKm: number } | null {
  const override = process.env.HOMES_CRAIGSLIST_SITE?.trim();
  if (override) return { site: override, distanceKm: 0 };

  let best: { site: string; distanceKm: number } | null = null;
  for (const s of CRAIGSLIST_SITES) {
    const d = haversineKm(center, s);
    if (!best || d < best.distanceKm) best = { site: s.site, distanceKm: d };
  }
  if (best && best.distanceKm <= MAX_SITE_DISTANCE_KM) return best;
  return null;
}

/** Craigslist category codes: rentals vs for-sale housing. */
function categoryFor(listingType: ListingType | 'any'): string {
  return listingType === 'sale' ? 'rea' : 'apa';
}

function inferPropertyType(text: string): PropertyType {
  const t = text.toLowerCase();
  if (/\bhouse\b|\bsingle family\b|\bsfh\b/.test(t)) return 'house';
  if (/\bcondo\b/.test(t)) return 'condo';
  if (/\btownhouse\b|\btownhome\b/.test(t)) return 'townhouse';
  if (/\broom\b|\bsublet\b/.test(t)) return 'room';
  if (/\bapartment\b|\bapt\b|\bstudio\b/.test(t)) return 'apartment';
  return 'apartment';
}

// --- Minimal RSS/RDF parsing (Craigslist feeds are RDF, one <item> per post) ---

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function tag(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1]).trim() : undefined;
}

function attr(block: string, name: string, key: string): string | undefined {
  const m = block.match(new RegExp(`<${name}[^>]*\\b${key}="([^"]*)"`, 'i'));
  return m ? decodeEntities(m[1]).trim() : undefined;
}

function parsePrice(title: string): number | null {
  const m = title.match(/\$\s?([0-9][0-9,]*)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseBeds(text: string): number | null {
  const m = text.match(/(\d+)\s?br\b/i) || text.match(/(\d+)\s?bed/i);
  if (m) return Number(m[1]);
  if (/\bstudio\b/i.test(text)) return 0;
  return null;
}

export class CraigslistProvider implements ListingProvider {
  readonly source = 'craigslist' as const;

  isEnabled(): boolean {
    return process.env.HOMES_DISABLE_CRAIGSLIST !== 'true';
  }

  disabledReason(): string {
    return 'Craigslist disabled (HOMES_DISABLE_CRAIGSLIST=true)';
  }

  async search(ctx: ProviderContext): Promise<Listing[]> {
    const picked = pickSite(ctx.center);
    if (!picked) {
      // No nearby Craigslist metro — treat as "no results" rather than an error.
      return [];
    }

    const { filters } = ctx;
    const url = new URL(
      `/search/${categoryFor(filters.listingType)}`,
      `https://${picked.site}.craigslist.org`,
    );
    url.searchParams.set('format', 'rss');
    if (filters.minPrice != null) url.searchParams.set('min_price', String(filters.minPrice));
    if (filters.maxPrice != null) url.searchParams.set('max_price', String(filters.maxPrice));
    if (filters.minBeds != null) url.searchParams.set('min_bedrooms', String(filters.minBeds));
    if (filters.petsAllowed) url.searchParams.set('pets_cat', '1');

    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) throw new Error(`Craigslist ${picked.site} returned ${res.status}`);

    const xml = await res.text();
    const items = xml
      .split(/<item[\s>]/i)
      .slice(1)
      .map((chunk) => '<item ' + chunk);

    const listings: Listing[] = [];
    for (const item of items) {
      const link = tag(item, 'link') || attr(item, 'link', 'rdf:resource');
      const title = tag(item, 'title');
      if (!link || !title) continue;

      const idMatch = link.match(/\/(\d+)\.html/);
      const externalId = idMatch ? idMatch[1] : link;

      const lat = Number(tag(item, 'geo:lat'));
      const lng = Number(tag(item, 'geo:long'));
      const description = tag(item, 'description');
      const postedAt = tag(item, 'dc:date') || tag(item, 'pubDate');

      const combined = `${title} ${description ?? ''}`;

      listings.push({
        id: makeListingId('craigslist', externalId),
        source: 'craigslist',
        externalId,
        title: title.replace(/\s+/g, ' ').trim(),
        description: description
          ?.replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
        listingType: filters.listingType === 'sale' ? 'sale' : 'rent',
        propertyType: inferPropertyType(combined),
        price: parsePrice(title),
        beds: parseBeds(combined),
        baths: null,
        sqft: (() => {
          const m = combined.match(/(\d[\d,]{2,})\s?(?:ft2|sqft|sq ft)/i);
          return m ? Number(m[1].replace(/,/g, '')) : null;
        })(),
        address: undefined,
        city: undefined,
        state: undefined,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        url: link,
        petsAllowed: filters.petsAllowed ? true : null,
        postedAt: postedAt ? new Date(postedAt).toISOString() : undefined,
      });
    }
    return listings;
  }
}
