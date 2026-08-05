/**
 * Link unfurler (B15) — server-only.
 *
 * `/api/oembed?type=og` already lifted OpenGraph tags out of a page, but it did
 * it inline in the route with no cache, no byte cap, and a raw third-party image
 * URL in the response. This module is the real thing:
 *
 *  - every outbound request goes through `safeFetch` (`lib/ssrf-guard.server`),
 *    which validates the URL, re-validates each redirect hop, and pins the
 *    connection to the address it validated;
 *  - the response body is read through a **byte-capped** reader, so a hostile
 *    or merely enormous page cannot stream gigabytes into the web tier;
 *  - results are cached in Redis for 24h under the CANONICALISED url, so a link
 *    posted five hundred times is fetched once — and degrade to no-cache (a live
 *    fetch per call, rate-limited at the route) when Redis is off, exactly like
 *    every other consumer of `redis.server`;
 *  - the image comes back as an `/api/image-proxy` path, never a third-party
 *    host, so rendering a preview never leaks the viewer's IP.
 */

import { safeFetch, SsrfError } from '@/lib/ssrf-guard.server';
import { redisGetJSON, redisSetJSON } from '@/lib/redis.server';
import { buildUnfurled, canonicalizeUrl, parseOpenGraph, type Unfurled } from './parse';

/** How much of a page we are willing to pull down before giving up. */
const MAX_BYTES = 512 * 1024;
/** Upstream timeout. Shorter than the image proxy's — this is a text fetch. */
const TIMEOUT_MS = 4_000;
/** Cache lifetime for a successful unfurl. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Trim long metadata before it is cached or shipped to a client. */
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 400;

const USER_AGENT = 'Mozilla/5.0 (compatible; RMHStudiosBot/1.0; +https://rmhstudios.com)';

function cacheKey(canonical: string): string {
  return `unfurl:${canonical}`;
}

function truncate(value: string | null, max: number): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/**
 * Read at most `maxBytes` of a response body and decode it as text.
 *
 * `res.text()` would buffer whatever the upstream sends; a `Content-Length`
 * header is a claim, not a guarantee. Reading chunk by chunk and cancelling once
 * the cap is reached is the only version of this that is actually bounded — and
 * cancelling also releases the SSRF guard's pinned connection immediately.
 */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const body = res.body;
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      const remaining = maxBytes - total;
      if (value.byteLength >= remaining) {
        chunks.push(value.subarray(0, remaining));
        total = maxBytes;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    // Releases the socket whether we finished or bailed at the cap.
    await reader.cancel().catch(() => {});
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  // `fatal: false` — a cap can land mid-codepoint, and a replacement character
  // in a title is better than throwing away the whole unfurl.
  return new TextDecoder('utf-8', { fatal: false }).decode(joined);
}

/** True for content types worth running an HTML parser over. */
function isHtml(contentType: string | null): boolean {
  if (!contentType) return true; // no header — try it; the parser fails safe
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return type === 'text/html' || type === 'application/xhtml+xml' || type === '';
}

/**
 * Unfurl a user-supplied link.
 *
 * Returns `null` when the link is not unfurlable (bad URL, non-HTML, upstream
 * error, no usable metadata). Throws `SsrfError` when the URL is refused by the
 * guard — a private/loopback/metadata address, a disallowed protocol, or a
 * redirect into one — so the caller can answer 400 rather than 502 and never
 * confuses "we refused" with "they were down".
 */
export async function unfurl(rawUrl: string): Promise<Unfurled | null> {
  const canonical = canonicalizeUrl(rawUrl);
  if (!canonical) return null;

  const key = cacheKey(canonical);
  const cached = await redisGetJSON<Unfurled>(key);
  if (cached) return cached;

  let res: Response;
  try {
    res = await safeFetch(canonical, {
      // http is allowed so a plain-http link still resolves; the guard still
      // rejects private destinations, and the image comes back proxied through
      // our own https origin either way.
      allowedProtocols: ['https:', 'http:'],
      timeoutMs: TIMEOUT_MS,
      maxRedirects: 3,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'Accept-Language': 'en',
      },
    });
  } catch (err) {
    if (err instanceof SsrfError) throw err;
    return null;
  }

  if (!res.ok || !isHtml(res.headers.get('content-type'))) {
    await res.body?.cancel().catch(() => {});
    return null;
  }

  const html = await readCapped(res, MAX_BYTES);
  const meta = parseOpenGraph(html);
  if (!meta.title && !meta.description) return null;

  const out = buildUnfurled(canonical, {
    ...meta,
    title: truncate(meta.title, MAX_TITLE),
    description: truncate(meta.description, MAX_DESCRIPTION),
  });

  await redisSetJSON(key, out, CACHE_TTL_MS);
  return out;
}
