/**
 * RMHHomes — provider abstraction (server only).
 *
 * Every listing source implements {@link ListingProvider}. The search
 * orchestrator (`../search.server.ts`) fans out to all enabled providers in
 * parallel, so a slow or failing source can never take the whole search down —
 * each provider is isolated behind a timeout and a try/catch, and reports its
 * own status.
 *
 * Adding a source = drop a new file next to this one implementing the interface
 * and register it in `../search.server.ts`. Nothing else changes.
 */

import type { Listing, ListingSource, SearchCenter, SearchFilters } from '../types';

/**
 * The resolved context handed to a provider for one query. `center` is always
 * set (the orchestrator geocodes before dispatch); `filters` is the full,
 * validated request.
 */
export interface ProviderContext {
  filters: SearchFilters;
  center: SearchCenter;
}

export interface ListingProvider {
  readonly source: ListingSource;

  /**
   * True when the provider is usable in the current environment. Key-gated
   * providers (RentCast) return false when their key is absent so the
   * orchestrator can skip them and report an informative status instead of a
   * hard error. Free providers return true.
   */
  isEnabled(): boolean;

  /**
   * Short reason shown in the UI when {@link isEnabled} is false
   * (e.g. "Set RENTCAST_API_KEY to enable").
   */
  disabledReason(): string;

  /**
   * Fetch matching listings for one query. Should already respect `center`,
   * `radiusKm`, and coarse filters where the upstream API supports them; the
   * orchestrator applies the full filter set again defensively, so a provider
   * over-returning is fine (correctness), under-returning is not.
   *
   * Must throw on transport/parse failure (the orchestrator converts that into
   * a per-provider error status) rather than returning partial/garbage data.
   */
  search(ctx: ProviderContext): Promise<Listing[]>;

  /**
   * Look up a single listing by its provider-native id, or null if the source
   * can't resolve individual listings (many scrape-based sources can't).
   */
  getById?(externalId: string): Promise<Listing | null>;
}

/** Build a globally-unique listing id from a source + native id. */
export function makeListingId(source: ListingSource, externalId: string): string {
  return `${source}:${externalId}`;
}

/** Split a `"<source>:<externalId>"` id back into its parts. */
export function parseListingId(id: string): { source: ListingSource; externalId: string } | null {
  const idx = id.indexOf(':');
  if (idx <= 0) return null;
  const source = id.slice(0, idx) as ListingSource;
  const externalId = id.slice(idx + 1);
  if (!externalId) return null;
  return { source, externalId };
}

/** Clamp/round helpers shared by adapters when coercing dirty upstream data. */
export function toFiniteNumber(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(/[^0-9.]/g, '')) : Number(v);
  return Number.isFinite(n) ? n : null;
}
