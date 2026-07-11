/**
 * RMHHomes scraper — Craigslist regional RSS adapter.
 *
 * Craigslist publishes an RSS feed for any search: append `?format=rss` to a
 * regional search path (e.g. https://rochester.craigslist.org/search/apa for
 * apartments/housing, /rea for real estate for sale). The feed is the RDF
 * variant with `<dc:date>` and `<geo:lat>/<geo:long>` tags. We read the feed
 * only — one request per source — and link every listing back to its original.
 */

import { politeFetch } from '../http';
import { parseFeedItems, pickField } from '../feed';
import { mapFeedItem } from './map';
import type {
  AdapterContext,
  HomeSourceAdapter,
  HomeSourceConfig,
  NormalizedListing,
} from '../types';

/** Default search categories by listing kind: apartments/housing vs. for-sale. */
const DEFAULT_CATEGORY: Record<'RENT' | 'SALE', string> = { RENT: 'apa', SALE: 'rea' };

export function craigslistFeedUrl(source: HomeSourceConfig): string | null {
  if (!source.region) return null;
  const category = source.category || DEFAULT_CATEGORY[source.listingType];
  return `https://${source.region}.craigslist.org/search/${category}?format=rss`;
}

/** A Craigslist post URL ends with `/<numeric-id>.html`; that id is our externalId. */
function craigslistId(url: string): string {
  const m = url.match(/\/(\d+)\.html/);
  return m ? m[1] : url;
}

export const craigslistAdapter: HomeSourceAdapter = {
  provider: 'CRAIGSLIST',

  feedUrl: craigslistFeedUrl,

  async discover(ctx: AdapterContext): Promise<NormalizedListing[]> {
    const url = craigslistFeedUrl(ctx.source);
    if (!url) return [];
    const res = await politeFetch(url, { fetchImpl: ctx.fetchImpl });
    if (!res.ok) return [];

    const out: NormalizedListing[] = [];
    const seen = new Set<string>();
    for (const item of parseFeedItems(res.body)) {
      const link = pickField(item.fields, ['link', 'guid', 'dc:source']);
      const externalId = link ? craigslistId(link) : '';
      const listing = mapFeedItem(item, externalId);
      if (!listing || seen.has(listing.externalId)) continue;
      seen.add(listing.externalId);
      out.push(listing);
    }
    return out;
  },
};
