import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rssAdapter, rssFeedUrl } from './rss';
import type { HomeSourceConfig } from '../types';

const FIXTURE = readFileSync(join(__dirname, '__fixtures__/rss-rentals.xml'), 'utf8');
const FEED_URL = 'https://feeds.example.com/rochester/rentals.xml';

const SOURCE: HomeSourceConfig = {
  id: 'src1',
  key: 'rss:feeds.example.com/rochester/rentals.xml',
  provider: 'RSS',
  label: 'Rochester Rentals',
  url: FEED_URL,
  listingType: 'RENT',
  defaultCity: 'Rochester',
  defaultState: 'NY',
  defaultLat: 43.1566,
  defaultLng: -77.6088,
};

function fakeFetch(responses: Record<string, { status: number; body: string }>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const hit = responses[url];
    if (!hit) return new Response('Not found', { status: 404 });
    return new Response(hit.body, { status: hit.status });
  }) as typeof fetch;
}

describe('rssFeedUrl', () => {
  it('returns the configured http/https feed URL', () => {
    expect(rssFeedUrl(SOURCE)).toBe(FEED_URL);
  });

  it('returns null when url is missing or non-http', () => {
    expect(rssFeedUrl({ ...SOURCE, url: null })).toBeNull();
    expect(rssFeedUrl({ ...SOURCE, url: 'ftp://feeds.example.com/feed.xml' })).toBeNull();
  });
});

describe('rssAdapter.discover', () => {
  it('parses the RSS feed fixture into normalized listings', async () => {
    const out = await rssAdapter.discover({
      source: SOURCE,
      fetchImpl: fakeFetch({ [FEED_URL]: { status: 200, body: FIXTURE } }),
    });
    expect(out).toHaveLength(2);

    const [a, b] = out;
    expect(a.externalId).toBe('1001');
    expect(a.price).toBe(1850);
    expect(a.beds).toBe(2);
    expect(a.sqft).toBe(900);
    expect(a.petsAllowed).toBe(true);
    expect(a.locationRaw).toBe('Park Ave');
    expect(a.lat).toBeCloseTo(43.2, 3);
    expect(a.lng).toBeCloseTo(-77.6, 3);
    expect(a.url).toBe('https://feeds.example.com/listings/1001');

    expect(b.externalId).toBe('1002');
    expect(b.beds).toBe(0); // studio
    expect(b.petsAllowed).toBe(false);
    expect(b.lat).toBeNull();
  });

  it('returns [] on HTTP failure without throwing', async () => {
    const out = await rssAdapter.discover({
      source: SOURCE,
      fetchImpl: fakeFetch({ [FEED_URL]: { status: 503, body: '' } }),
    });
    expect(out).toEqual([]);
  });
});
