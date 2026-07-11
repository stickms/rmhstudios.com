import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { craigslistAdapter, craigslistFeedUrl } from './craigslist';
import type { HomeSourceConfig } from '../types';

const FIXTURE = readFileSync(join(__dirname, '__fixtures__/craigslist-apa.rss'), 'utf8');

const SOURCE: HomeSourceConfig = {
  id: 'src1',
  key: 'craigslist:rochester:apa',
  provider: 'CRAIGSLIST',
  label: 'Craigslist Rochester — Rentals',
  region: 'rochester',
  category: 'apa',
  url: null,
  listingType: 'RENT',
  defaultCity: 'Rochester',
  defaultState: 'NY',
  defaultLat: 43.1566,
  defaultLng: -77.6088,
};

/** fetch stub: serves the fixture at the feed URL, 404s everything else. */
function fetchServing(body: string, feedUrl: string): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === feedUrl) return new Response(body, { status: 200 });
    return new Response('', { status: 404 });
  }) as typeof fetch;
}

describe('craigslistFeedUrl', () => {
  it('builds the regional RSS URL from region + category', () => {
    expect(craigslistFeedUrl(SOURCE)).toBe(
      'https://rochester.craigslist.org/search/apa?format=rss',
    );
  });
  it('defaults the category by listing type', () => {
    expect(craigslistFeedUrl({ ...SOURCE, category: null })).toBe(
      'https://rochester.craigslist.org/search/apa?format=rss',
    );
    expect(craigslistFeedUrl({ ...SOURCE, category: null, listingType: 'SALE' })).toBe(
      'https://rochester.craigslist.org/search/rea?format=rss',
    );
  });
  it('is null without a region', () => {
    expect(craigslistFeedUrl({ ...SOURCE, region: null })).toBeNull();
  });
});

describe('craigslistAdapter.discover', () => {
  const feedUrl = craigslistFeedUrl(SOURCE)!;

  it('parses the feed into normalized listings', async () => {
    const out = await craigslistAdapter.discover({
      source: SOURCE,
      fetchImpl: fetchServing(FIXTURE, feedUrl),
    });
    expect(out).toHaveLength(2);

    const a = out[0];
    expect(a.externalId).toBe('1001'); // numeric id from /1001.html
    expect(a.title).toBe('Sunny flat near the park (Park Ave)');
    expect(a.price).toBe(1850);
    expect(a.beds).toBe(2);
    expect(a.sqft).toBe(900);
    expect(a.petsAllowed).toBe(true);
    expect(a.lat).toBeCloseTo(43.2);
    expect(a.lng).toBeCloseTo(-77.6);
    expect(a.url).toBe('https://rochester.craigslist.org/apa/d/x/1001.html');

    const b = out[1];
    expect(b.externalId).toBe('1002');
    expect(b.beds).toBe(0); // studio
    expect(b.petsAllowed).toBe(false);
    expect(b.lat).toBeNull(); // no geo tags → resolved from source default later
  });

  it('returns [] when the feed fetch fails', async () => {
    const out = await craigslistAdapter.discover({
      source: SOURCE,
      fetchImpl: fetchServing('', 'https://other.example/nope'),
    });
    expect(out).toEqual([]);
  });
});
