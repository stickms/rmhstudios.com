import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { renderUrlset, type SitemapEntry } from '@/lib/sitemap';

/** Batch-gzip serialisation, the L1 cache + single-flight, and the HTTP validators. */

const batches = vi.fn();
const createdGz = vi.hoisted(() => [] as import('node:zlib').Gzip[]);
vi.mock('node:zlib', async (orig) => {
  const actual = await orig<typeof import('node:zlib')>();
  return {
    ...actual,
    createGzip: (...a: Parameters<typeof actual.createGzip>) => {
      const g = actual.createGzip(...a);
      createdGz.push(g);
      return g;
    },
  };
});
vi.mock('@/lib/sitemap.server', () => ({
  renderSectionBatches: (...a: unknown[]) => batches(...a),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/seo', () => ({ SITE_URL: 'https://example.test' }));

const entry = (i: number): SitemapEntry => ({
  loc: `/u/h${i}/post/${i}`,
  lastmod: new Date(0),
  changefreq: 'weekly',
  priority: 0.4,
});

async function* gen(slices: SitemapEntry[][]) {
  for (const s of slices) yield s;
}

beforeEach(async () => {
  batches.mockReset();
  const { clearSitemapCache } = await import('@/lib/sitemap-serve.server');
  clearSitemapCache();
});

describe('gzipUrlset', () => {
  it('is byte-identical to renderUrlset once decompressed, across any batching', async () => {
    const { gzipUrlset } = await import('@/lib/sitemap-serve.server');
    const all = Array.from({ length: 23 }, (_, i) => entry(i));
    const expected = renderUrlset(all, 'https://example.test');
    const a = await gzipUrlset(all, 'https://example.test', 5);
    const b = await gzipUrlset(
      gen([all.slice(0, 1), all.slice(1, 20), all.slice(20)]),
      'https://example.test',
    );
    expect(gunzipSync(a.gzip).toString()).toBe(expected);
    expect(gunzipSync(b.gzip).toString()).toBe(expected);
    expect(b.entries).toBe(23);
  });

  it('destroys the gzip stream and propagates when the source throws', async () => {
    createdGz.length = 0;
    const { gzipUrlset } = await import('@/lib/sitemap-serve.server');
    async function* boom() {
      yield [entry(1)];
      throw new Error('db down');
    }
    await expect(gzipUrlset(boom(), 'https://example.test')).rejects.toThrow('db down');
    expect(createdGz.length).toBeGreaterThan(0);
    expect(createdGz.every((g) => g.destroyed)).toBe(true);
  });

  it('renders an empty section exactly as before', async () => {
    const { gzipUrlset } = await import('@/lib/sitemap-serve.server');
    const { gzip } = await gzipUrlset(gen([]), 'https://example.test');
    expect(gunzipSync(gzip).toString()).toBe(renderUrlset([], 'https://example.test'));
  });
});

describe('getSitemapBody', () => {
  it('runs one build for concurrent requests, then serves from cache', async () => {
    const { getSitemapBody } = await import('@/lib/sitemap-serve.server');
    batches.mockImplementation(() => gen([[entry(1)]]));
    const [a, b] = await Promise.all([getSitemapBody('posts', 1), getSitemapBody('posts', 1)]);
    await getSitemapBody('posts', 1);
    expect(batches).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('returns null for an unknown section', async () => {
    const { getSitemapBody } = await import('@/lib/sitemap-serve.server');
    batches.mockReturnValue(null);
    expect(await getSitemapBody('nope', 1)).toBeNull();
  });

  it('does not cache a failure and serves an empty urlset', async () => {
    const { getSitemapBody } = await import('@/lib/sitemap-serve.server');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // A section whose first batch query fails: an async iterable that rejects on first read.
    batches.mockImplementationOnce(() => ({
      [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new Error('db down')) }),
    }));
    const bad = await getSitemapBody('posts', 1);
    expect(bad?.tag).toBe('err');
    batches.mockImplementation(() => gen([[entry(1)]]));
    const good = await getSitemapBody('posts', 1);
    expect(good?.entries).toBe(1);
  });
});

describe('respondSitemap', () => {
  const req = (h: Record<string, string> = {}) =>
    new Request('https://example.test/s', { headers: h });

  it('serves gzip with a strong ETag, public cache headers and Vary', async () => {
    const { respondSitemap } = await import('@/lib/sitemap-serve.server');
    batches.mockImplementation(() => gen([[entry(1)]]));
    const res = (await respondSitemap(req({ 'accept-encoding': 'gzip, br' }), 'posts', 1))!;
    expect(res.status).toBe(200);
    expect(res.headers.get('content-encoding')).toBe('gzip');
    expect(res.headers.get('etag')).toMatch(/^"[^"]+"$/);
    expect(res.headers.get('cache-control')).toContain('public');
    expect(res.headers.get('cache-control')).toContain('max-age=3600');
    expect(res.headers.get('vary')).toContain('Accept-Encoding');
    expect(gunzipSync(Buffer.from(await res.arrayBuffer())).toString()).toContain('/u/h1/post/1');
  });

  it('answers If-None-Match with 304 and repeats the cache headers', async () => {
    const { respondSitemap } = await import('@/lib/sitemap-serve.server');
    batches.mockImplementation(() => gen([[entry(1)]]));
    const first = (await respondSitemap(req({ 'accept-encoding': 'gzip' }), 'posts', 1))!;
    const etag = first.headers.get('etag')!;
    const res = (await respondSitemap(
      req({ 'accept-encoding': 'gzip', 'if-none-match': etag }),
      'posts',
      1,
    ))!;
    expect(res.status).toBe(304);
    expect(res.headers.get('cache-control')).toContain('max-age=3600');
    expect(res.headers.get('etag')).toBe(etag);
  });

  it('gives identity clients plain XML under a different validator', async () => {
    const { respondSitemap } = await import('@/lib/sitemap-serve.server');
    batches.mockImplementation(() => gen([[entry(1)]]));
    const gz = (await respondSitemap(req({ 'accept-encoding': 'gzip' }), 'posts', 1))!;
    const id = (await respondSitemap(req(), 'posts', 1))!;
    expect(id.headers.get('content-encoding')).toBeNull();
    expect(id.headers.get('etag')).not.toBe(gz.headers.get('etag'));
    expect(await id.text()).toContain('<urlset');
  });
});
