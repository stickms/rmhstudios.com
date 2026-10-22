/**
 * Serving one child sitemap: batch-serialise into gzip, cache, validate.
 *
 * A full `posts` chunk is 40,000 entries and ~7.8 MB of XML. Building that as one
 * string cost ~45 ms of uninterrupted event loop (the whole 50 ms budget) and
 * held a 7.8 MB string per request, and every crawler fetch repeated the DB
 * query. So the XML is written in `BATCH` entry slices into a gzip stream with
 * a macrotask yield between them, and the compressed result (~10x smaller) is
 * held in a small process-local cache with single-flight, so a burst of
 * crawlers costs one query.
 *
 * The cache is L1 only on purpose: the value is hundreds of KB of binary,
 * which `cached()`'s JSON-in-Redis path is the wrong shape for. The TTL is
 * short because nothing invalidates it; the response's own `max-age=3600` is
 * the real freshness contract with crawlers, so this only has to be shorter
 * than that. A community made private can therefore stay listed for up to
 * `TTL_MS` more than it already could.
 */

import { createHash } from 'node:crypto';
import { createGzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { SITE_URL } from '@/lib/seo';
import {
  renderUrlEntry,
  URLSET_CLOSE,
  URLSET_OPEN,
  type SitemapEntry,
  type SitemapSectionName,
} from '@/lib/sitemap';
import { renderSectionBatches } from '@/lib/sitemap.server';
import { buildCacheHeaders, ifNoneMatchMatches } from '@/lib/api/handler.server';

const gunzipAsync = promisify(gunzip);

/** Entries per slice: ~5k entries is ~1 MB of XML and ~6 ms of CPU. */
export const SITEMAP_BATCH = 5_000;
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES_CACHED = 48;

export interface SitemapBody {
  gzip: Buffer;
  /** Strong validator for the gzip representation; the identity one appends `-id`. */
  tag: string;
  entries: number;
  at: number;
}

/**
 * Serialise slices to gzip, yielding the event loop between them. The source
 * is an async iterable so the database reads are sliced the same way.
 */
export async function gzipUrlset(
  batches: AsyncIterable<SitemapEntry[]> | SitemapEntry[],
  origin: string,
  batch = SITEMAP_BATCH,
): Promise<{ gzip: Buffer; entries: number }> {
  const gz = createGzip({ level: 6 });
  const out: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    gz.on('data', (b: Buffer) => out.push(b));
    gz.on('end', () => resolve(Buffer.concat(out)));
    gz.on('error', reject);
  });
  const write = (s: string) =>
    gz.write(s) ? Promise.resolve() : new Promise<void>((r) => gz.once('drain', r));

  async function* slices(): AsyncGenerator<SitemapEntry[]> {
    if (Array.isArray(batches)) {
      for (let i = 0; i < batches.length; i += batch) yield batches.slice(i, i + batch);
    } else {
      yield* batches;
    }
  }

  try {
    await write(URLSET_OPEN);
    let n = 0;
    for await (const slice of slices()) {
      await write((n > 0 ? '\n' : '') + slice.map((e) => renderUrlEntry(e, origin)).join('\n'));
      n += slice.length;
      await new Promise<void>((r) => setImmediate(r));
    }
    await write(URLSET_CLOSE);
    gz.end();
    return { gzip: await done, entries: n };
  } catch (e) {
    // The source threw mid-stream: tear the compressor down so it does not
    // sit half-open, and swallow its own rejection (we rethrow the cause).
    done.catch(() => {});
    gz.destroy();
    throw e;
  }
}

const cache = new Map<string, SitemapBody>();
const inflight = new Map<string, Promise<SitemapBody | null>>();

/** Test hook. */
export function clearSitemapCache(): void {
  cache.clear();
  inflight.clear();
}

/** A built chunk, from L1 when fresh, or null when the section does not exist. */
export function getSitemapBody(section: string, chunk: number): Promise<SitemapBody | null> {
  const key = `${section}:${chunk}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;

  const p = (async () => {
    const source = renderSectionBatches(section, chunk);
    if (!source) return null;
    let built: { gzip: Buffer; entries: number };
    try {
      built = await gzipUrlset(source, SITE_URL);
    } catch (e) {
      // Degrade to an empty urlset rather than 5xx (crawlers back off sitewide
      // on repeated sitemap 5xx). Not cached: the next request retries.
      console.error(`[sitemap] section "${section}" failed to render:`, e);
      const { gzip } = await gzipUrlset([], SITE_URL);
      return { gzip, tag: 'err', entries: 0, at: 0 } satisfies SitemapBody;
    }
    const { gzip } = built;
    const body: SitemapBody = {
      gzip,
      tag: createHash('sha1').update(gzip).digest('base64url'),
      entries: built.entries,
      at: Date.now(),
    };
    if (cache.size >= MAX_ENTRIES_CACHED) {
      cache.delete(cache.keys().next().value as string);
    }
    cache.set(key, body);
    return body;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const CACHE = buildCacheHeaders({
  visibility: 'public',
  maxAge: 3600,
  sMaxAge: 3600,
  staleWhileRevalidate: 86400,
});

/** The full HTTP answer for `/sitemaps/{section}[-{n}].xml`, or null for a 404. */
export async function respondSitemap(
  request: Request,
  section: SitemapSectionName | string,
  chunk: number,
): Promise<Response | null> {
  const body = await getSitemapBody(section, chunk);
  if (!body) return null;
  const acceptsGzip = /\bgzip\b/i.test(request.headers.get('accept-encoding') ?? '');
  const base = {
    'Content-Type': 'application/xml; charset=utf-8',
    ...CACHE,
  };
  if (body.tag === 'err') {
    // Never advertise a validator or long freshness for a degraded response.
    return new Response(acceptsGzip ? new Uint8Array(body.gzip) : await gunzipAsync(body.gzip), {
      status: 200,
      headers: {
        'Content-Type': base['Content-Type'],
        vary: 'Accept-Encoding',
        'cache-control': 'public, max-age=60',
        ...(acceptsGzip ? { 'Content-Encoding': 'gzip' } : {}),
      },
    });
  }
  const etag = `"${body.tag}${acceptsGzip ? '' : '-id'}"`;
  const headers: Record<string, string> = { ...base, ETag: etag };
  const inm = request.headers.get('if-none-match');
  if (inm && ifNoneMatchMatches(inm, etag)) {
    return new Response(null, { status: 304, headers });
  }
  if (acceptsGzip) {
    return new Response(new Uint8Array(body.gzip), {
      status: 200,
      headers: { ...headers, 'Content-Encoding': 'gzip' },
    });
  }
  return new Response(new Uint8Array(await gunzipAsync(body.gzip)), { status: 200, headers });
}
