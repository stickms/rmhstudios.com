/**
 * RMHHomes scraper — generic RSS 2.0 housing-feed adapter.
 *
 * For any public housing feed configured by full `url` (property-manager feeds,
 * regional listing sites that publish RSS, etc.). Uses `<guid>` (falling back to
 * `<link>`) as the stable id and the shared field mapping. Coordinates come from
 * `<geo:*>` tags when present, otherwise the source's default location is used
 * downstream by the ingest layer.
 */

import { createHash } from 'node:crypto';
import { politeFetch } from '../http';
import { parseFeedItems, pickField } from '../feed';
import { mapFeedItem } from './map';
import type {
  AdapterContext,
  HomeSourceAdapter,
  HomeSourceConfig,
  NormalizedListing,
} from '../types';

export function rssFeedUrl(source: HomeSourceConfig): string | null {
  return source.url && /^https?:\/\//i.test(source.url) ? source.url : null;
}

/** Prefer an explicit guid; else a stable hash of the link. */
function rssId(fields: Record<string, string>): string {
  const guid = pickField(fields, ['guid']);
  if (guid) return guid.slice(0, 200);
  const link = pickField(fields, ['link', 'dc:source']);
  if (!link) return '';
  return createHash('sha1').update(link).digest('hex').slice(0, 24);
}

export const rssAdapter: HomeSourceAdapter = {
  provider: 'RSS',

  feedUrl: rssFeedUrl,

  async discover(ctx: AdapterContext): Promise<NormalizedListing[]> {
    const url = rssFeedUrl(ctx.source);
    if (!url) return [];
    const res = await politeFetch(url, { fetchImpl: ctx.fetchImpl });
    if (!res.ok) return [];

    const out: NormalizedListing[] = [];
    const seen = new Set<string>();
    for (const item of parseFeedItems(res.body)) {
      const listing = mapFeedItem(item, rssId(item.fields));
      if (!listing || seen.has(listing.externalId)) continue;
      seen.add(listing.externalId);
      out.push(listing);
    }
    return out;
  },
};
