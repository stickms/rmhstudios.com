/**
 * RMHHomes scraper — text field extractors (client-safe, pure).
 *
 * Feeds like Craigslist encode structured facts in free text — a title such as
 * "$1,850 / 2br - 900ft2 - Sunny flat near the park (Park Ave)" carries price,
 * beds, size and neighborhood. These helpers pull those out heuristically;
 * every one returns null when it can't find a confident value, so the ingest
 * layer can fall back to sensible defaults. Kept pure + dependency-free so the
 * neighbouring tests can hammer them.
 */

import type { PropertyType } from '../types';

/** First "$1,850" / "$525,000" style amount → whole dollars, else null. */
export function extractPrice(text: string): number | null {
  const m = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0 || n > 100_000_000) return null;
  return Math.round(n);
}

/** Bedrooms: "2br" / "2 bed" / "studio" (→ 0), else null. */
export function extractBeds(text: string): number | null {
  if (/\bstudio\b/i.test(text)) return 0;
  const m = text.match(/(\d+)\s*(?:br\b|bed\b|bedrooms?\b|bdrm?s?\b)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 && n <= 50 ? n : null;
}

/** Bathrooms: "1.5ba" / "2 bath", else null. */
export function extractBaths(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:ba\b|baths?\b|bathrooms?\b)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 && n <= 50 ? n : null;
}

/** Size in square feet: "900ft2" / "1,800 sqft" / "900 sq ft", else null. */
export function extractSqft(text: string): number | null {
  const m = text.match(/(\d[\d,]*)\s*(?:ft2|ft²|sqft|sq\.?\s?ft\.?|square\s?feet)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 && n <= 1_000_000 ? n : null;
}

const TYPE_KEYWORDS: [RegExp, PropertyType][] = [
  [/\btown\s?house\b|\btownhome\b/i, 'TOWNHOUSE'],
  [/\bcondo(?:minium)?\b/i, 'CONDO'],
  [/\b(?:private\s+)?room\b|\broommate\b|\bsublet\b/i, 'ROOM'],
  [/\bapartment\b|\bapt\b|\bflat\b|\bunit\b|\bloft\b/i, 'APARTMENT'],
  [/\bhouse\b|\bhome\b|\bbungalow\b|\bcottage\b|\bcolonial\b|\bcabin\b/i, 'HOUSE'],
];

/** Best-guess property type from keywords, else null. */
export function extractPropertyType(text: string): PropertyType | null {
  for (const [re, type] of TYPE_KEYWORDS) {
    if (re.test(text)) return type;
  }
  return null;
}

/** Pet policy: true / false when stated, null when unknown. */
export function extractPetsAllowed(text: string): boolean | null {
  if (/\bno\s+pets\b|\bpets?\s+not\s+allowed\b/i.test(text)) return false;
  if (
    /\bcats?\s+(?:are\s+)?ok\b|\bdogs?\s+(?:are\s+)?ok\b|\bpets?\s+ok\b|\bpet[\s-]friendly\b|\bpets?\s+allowed\b|\bpets?\s+welcome\b/i.test(
      text,
    )
  ) {
    return true;
  }
  return null;
}

/** Trailing "(Neighborhood)" from a Craigslist title, else null. */
export function neighborhoodFromTitle(title: string): string | null {
  const matches = [...title.matchAll(/\(([^)]+)\)/g)];
  const last = matches.at(-1);
  const v = last?.[1]?.trim();
  return v && v.length <= 120 ? v : null;
}

/**
 * A human-readable title: strip the leading "$price / Nbr - Yft2 -" metadata
 * Craigslist prepends. Falls back to the original when stripping empties it
 * (e.g. a clean RSS title with no metadata is returned unchanged).
 */
export function cleanTitle(title: string): string {
  let t = title
    .replace(/^\s*\$[\d,]+(?:\.\d{1,2})?\s*/, '') // leading price
    .replace(/\/\s*(?:studio|\d+\s*br)\b/gi, ' ') // "/ 2br"
    .replace(/\b\d[\d,]*\s*(?:ft2|ft²|sqft|sq\.?\s?ft\.?)\b/gi, ' ') // "900ft2"
    .replace(/^[\s/–—-]+/, '') // leading separators left behind
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (t.length < 3) t = title.trim();
  return t.slice(0, 120);
}
