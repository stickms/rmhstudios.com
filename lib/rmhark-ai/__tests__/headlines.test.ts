import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { safeFetchMock } = vi.hoisted(() => ({ safeFetchMock: vi.fn() }));
vi.mock('@/lib/ssrf-guard.server', () => ({ safeFetch: safeFetchMock }));

import {
  DEFAULT_HEADLINE_FEEDS,
  headlineFeeds,
  parseFeed,
  fetchHeadlines,
  getFreshHeadlines,
  resetHeadlineCache,
} from '@/lib/rmhark-ai/headlines.server';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const HOUR = 3_600_000;
const GOOGLE = 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en';

function rfc(ms: number): string {
  return new Date(ms).toUTCString();
}

function item(o: { title?: string; link?: string; at?: number; desc?: string; source?: string }): string {
  return `<item>${o.title !== undefined ? `<title>${o.title}</title>` : ''}${
    o.link !== undefined ? `<link>${o.link}</link>` : ''
  }${o.at !== undefined ? `<pubDate>${rfc(o.at)}</pubDate>` : ''}${
    o.desc !== undefined ? `<description>${o.desc}</description>` : ''
  }${o.source !== undefined ? `<source url="https://x.example">${o.source}</source>` : ''}</item>`;
}

function rss(items: string[], title = 'Feed Title'): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title>${items.join('')}</channel></rss>`;
}

function okResponse(body: string): Response {
  return new Response(body, { status: 200 });
}

describe('headlineFeeds', () => {
  it('defaults to Google News feeds', () => {
    const feeds = headlineFeeds({});
    expect(feeds).toEqual([...DEFAULT_HEADLINE_FEEDS]);
    expect(feeds.length).toBeGreaterThan(0);
    for (const f of feeds) expect(f.startsWith('https://news.google.com/')).toBe(true);
  });

  it('BOT_NEWS_FEEDS overrides and drops junk', () => {
    const feeds = headlineFeeds({
      BOT_NEWS_FEEDS: ' https://a.example/rss , http://b.example/rss, not a url, ftp://c.example/x,,https://d.example/f ',
    });
    expect(feeds).toEqual(['https://a.example/rss', 'https://d.example/f']);
  });

  it('an explicit empty string disables outside news', () => {
    expect(headlineFeeds({ BOT_NEWS_FEEDS: '' })).toEqual([]);
  });
});

describe('parseFeed', () => {
  it('splits the Google News publisher off the title', async () => {
    const xml = rss([item({ title: 'Markets rally on rate hopes - Reuters', link: 'https://n.example/a', at: NOW - HOUR })]);
    const [h] = await parseFeed(xml, GOOGLE, NOW);
    expect(h).toMatchObject({ title: 'Markets rally on rate hopes', source: 'Reuters', url: 'https://n.example/a' });
    expect(h?.publishedAt).toBe(NOW - HOUR);
  });

  it('prefers the source element and keeps hyphens elsewhere', async () => {
    const xml = rss([
      item({ title: 'Big - deal - BBC News', link: 'https://n.example/b', at: NOW, source: 'BBC News' }),
    ]);
    const [h] = await parseFeed(xml, GOOGLE, NOW);
    expect(h?.source).toBe('BBC News');
  });

  it('does not split titles of non-Google feeds', async () => {
    const xml = rss([item({ title: 'A - B', link: 'https://n.example/c', at: NOW })], 'My Blog');
    const [h] = await parseFeed(xml, 'https://blog.example/rss', NOW);
    expect(h).toMatchObject({ title: 'A - B', source: 'My Blog' });
  });

  it('falls back to the link hostname for source', async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel>${item({
      title: 'T',
      link: 'https://www.example.org/p',
      at: NOW,
    })}</channel></rss>`;
    const [h] = await parseFeed(xml, 'https://blog.example/rss', NOW);
    expect(h?.source).toBe('example.org');
  });

  it('strips HTML and entities to plain text and caps lengths', async () => {
    const long = 'x'.repeat(500);
    const xml = rss([
      item({
        title: 'Fish &amp;amp; chips &lt;b&gt;boom&lt;/b&gt;',
        link: 'https://n.example/d',
        at: NOW,
        desc: `&lt;p&gt;Hello&nbsp;&lt;a href=&quot;https://x&quot;&gt;world&lt;/a&gt; &amp;#39;quoted&amp;#39;\n\n  ${long}&lt;/p&gt;`,
      }),
    ]);
    const [h] = await parseFeed(xml, 'https://blog.example/rss', NOW);
    expect(h?.title).toBe('Fish & chips boom');
    expect(h?.summary.startsWith("Hello world 'quoted' xxx")).toBe(true);
    expect(h?.summary.length).toBeLessThanOrEqual(300);
    expect(h?.summary).not.toMatch(/[<>]/);
  });

  it('caps long titles at 200', async () => {
    const xml = rss([item({ title: 'y'.repeat(400), link: 'https://n.example/e', at: NOW })]);
    const [h] = await parseFeed(xml, 'https://blog.example/rss', NOW);
    expect(h?.title.length).toBe(200);
  });

  it('drops old, future, titleless, linkless and non-http items', async () => {
    const xml = rss([
      item({ title: 'old', link: 'https://n.example/old', at: NOW - 40 * HOUR }),
      item({ title: 'future', link: 'https://n.example/future', at: NOW + 2 * HOUR }),
      item({ title: 'slightly ahead', link: 'https://n.example/ahead', at: NOW + 30 * 60_000 }),
      item({ link: 'https://n.example/notitle', at: NOW }),
      item({ title: 'nolink', at: NOW }),
      item({ title: 'js', link: 'javascript:alert(1)', at: NOW }),
      item({ title: 'ok', link: 'https://n.example/ok', at: NOW - 35 * HOUR }),
    ]);
    const out = await parseFeed(xml, 'https://blog.example/rss', NOW);
    expect(out.map((h) => h.title).sort()).toEqual(['ok', 'slightly ahead']);
  });

  it('uses now when the date is missing', async () => {
    const xml = rss([item({ title: 'undated', link: 'https://n.example/u' })]);
    const [h] = await parseFeed(xml, 'https://blog.example/rss', NOW);
    expect(h?.publishedAt).toBe(NOW);
  });

  it('keys are stable, 32 hex chars, and ignore fragments and host case', async () => {
    const a = await parseFeed(rss([item({ title: 'A', link: 'https://N.example/p#frag', at: NOW })]), GOOGLE, NOW);
    const b = await parseFeed(rss([item({ title: 'Z', link: 'https://n.example/p', at: NOW })]), GOOGLE, NOW);
    expect(a[0]?.key).toMatch(/^[0-9a-f]{32}$/);
    expect(a[0]?.key).toBe(b[0]?.key);
    const c = await parseFeed(rss([item({ title: 'A', link: 'https://n.example/q', at: NOW })]), GOOGLE, NOW);
    expect(c[0]?.key).not.toBe(a[0]?.key);
  });
});

describe('fetchHeadlines', () => {
  it('tolerates one failing feed and logs it', async () => {
    const warn = vi.fn();
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('bad')) throw new Error('boom');
      return okResponse(rss([item({ title: 'Good', link: 'https://n.example/g', at: NOW })]));
    }) as unknown as typeof fetch;
    const out = await fetchHeadlines({
      feeds: ['https://bad.example/rss', 'https://good.example/rss'],
      now: NOW,
      fetchImpl,
      log: { warn },
    });
    expect(out.map((h) => h.title)).toEqual(['Good']);
    expect(warn).toHaveBeenCalledWith('bot_worker.headlines_feed_failed', expect.objectContaining({ feed: 'https://bad.example/rss' }));
  });

  it('treats non-2xx and malformed XML as failures', async () => {
    const warn = vi.fn();
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      String(url).includes('500') ? new Response('no', { status: 500 }) : okResponse('this is not xml <<<'),
    ) as unknown as typeof fetch;
    const out = await fetchHeadlines({
      feeds: ['https://500.example/rss', 'https://junk.example/rss'],
      now: NOW,
      fetchImpl,
      log: { warn },
    });
    expect(out).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('dedupes by key and by case-insensitive title, newest first', async () => {
    const f1 = rss([
      item({ title: 'Same Story', link: 'https://n.example/1', at: NOW - 3 * HOUR }),
      item({ title: 'Older', link: 'https://n.example/2', at: NOW - 5 * HOUR }),
    ]);
    const f2 = rss([
      item({ title: 'same story', link: 'https://m.example/other', at: NOW - 2 * HOUR }),
      item({ title: 'Same link other title', link: 'https://n.example/1', at: NOW - 1 * HOUR }),
      item({ title: 'Newest', link: 'https://m.example/new', at: NOW - 30 * 60_000 }),
    ]);
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      okResponse(String(url).includes('one') ? f1 : f2),
    ) as unknown as typeof fetch;
    const out = await fetchHeadlines({
      feeds: ['https://one.example/rss', 'https://two.example/rss'],
      now: NOW,
      fetchImpl,
    });
    expect(out.map((h) => h.title)).toEqual(['Newest', 'Same link other title', 'same story', 'Older']);
    const times = out.map((h) => h.publishedAt);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('caps the merged list at 60', async () => {
    const items = Array.from({ length: 80 }, (_, i) =>
      item({ title: `Story ${i}`, link: `https://n.example/${i}`, at: NOW - i * 60_000 }),
    );
    const fetchImpl = vi.fn(async () => okResponse(rss(items))) as unknown as typeof fetch;
    const out = await fetchHeadlines({ feeds: ['https://one.example/rss'], now: NOW, fetchImpl });
    expect(out).toHaveLength(60);
  });

  it('rejects a response over 1 MB (declared or streamed)', async () => {
    const warn = vi.fn();
    const huge = rss([item({ title: 'Big', link: 'https://n.example/big', at: NOW, desc: 'z'.repeat(1_100_000) })]);
    const fetchImpl = vi.fn(async () => okResponse(huge)) as unknown as typeof fetch;
    const out = await fetchHeadlines({ feeds: ['https://one.example/rss'], now: NOW, fetchImpl, log: { warn } });
    expect(out).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('never throws, even when the logger does', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    await expect(
      fetchHeadlines({
        feeds: ['https://one.example/rss'],
        now: NOW,
        fetchImpl,
        log: {
          warn: () => {
            throw new Error('logger broke');
          },
        },
      }),
    ).resolves.toEqual([]);
  });

  it('returns [] with no feeds', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await fetchHeadlines({ feeds: [], now: NOW, fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('getFreshHeadlines', () => {
  const feedWith = (title: string, at: number) =>
    rss([item({ title, link: `https://n.example/${encodeURIComponent(title)}`, at })]);

  beforeEach(() => {
    resetHeadlineCache();
    safeFetchMock.mockReset();
    process.env.BOT_NEWS_FEEDS = 'https://one.example/rss';
    delete process.env.BOT_NEWS_REFRESH_MS;
  });
  afterEach(() => {
    delete process.env.BOT_NEWS_FEEDS;
    delete process.env.BOT_NEWS_REFRESH_MS;
  });

  it('single-flights concurrent callers', async () => {
    safeFetchMock.mockImplementation(async () => okResponse(feedWith('One', NOW)));
    const [a, b, c] = await Promise.all([
      getFreshHeadlines(NOW),
      getFreshHeadlines(NOW),
      getFreshHeadlines(NOW),
    ]);
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
    expect(a.map((h) => h.title)).toEqual(['One']);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('refreshes only after the interval', async () => {
    safeFetchMock.mockImplementation(async () => okResponse(feedWith('One', NOW)));
    await getFreshHeadlines(NOW);
    await getFreshHeadlines(NOW + 14 * 60_000);
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
    await getFreshHeadlines(NOW + 16 * 60_000);
    expect(safeFetchMock).toHaveBeenCalledTimes(2);
  });

  it('honours BOT_NEWS_REFRESH_MS', async () => {
    process.env.BOT_NEWS_REFRESH_MS = '1000';
    safeFetchMock.mockImplementation(async () => okResponse(feedWith('One', NOW)));
    await getFreshHeadlines(NOW);
    await getFreshHeadlines(NOW + 2000);
    expect(safeFetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves the last good list when a refresh fails or comes back empty', async () => {
    safeFetchMock.mockImplementationOnce(async () => okResponse(feedWith('Keep', NOW)));
    expect((await getFreshHeadlines(NOW)).map((h) => h.title)).toEqual(['Keep']);

    safeFetchMock.mockImplementationOnce(async () => {
      throw new Error('network down');
    });
    expect((await getFreshHeadlines(NOW + HOUR)).map((h) => h.title)).toEqual(['Keep']);

    safeFetchMock.mockImplementationOnce(async () => okResponse(rss([])));
    expect((await getFreshHeadlines(NOW + 2 * HOUR)).map((h) => h.title)).toEqual(['Keep']);
  });

  it('re-filters the cached list by age on every read', async () => {
    safeFetchMock.mockImplementation(async () => okResponse(feedWith('Aging', NOW)));
    expect(await getFreshHeadlines(NOW)).toHaveLength(1);
    process.env.BOT_NEWS_REFRESH_MS = String(100 * HOUR);
    expect(await getFreshHeadlines(NOW + 37 * HOUR)).toEqual([]);
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns [] and does not throw when nothing was ever fetched', async () => {
    safeFetchMock.mockImplementation(async () => {
      throw new Error('down');
    });
    await expect(getFreshHeadlines(NOW)).resolves.toEqual([]);
  });
});
