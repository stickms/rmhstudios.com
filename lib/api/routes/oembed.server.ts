import { createHash } from 'node:crypto';
import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { safeFetch, SsrfError } from '@/lib/ssrf-guard.server';
import { cachedNullable } from '@/lib/cached.server';
import { readCapped } from '@/lib/unfurl/unfurl.server';
import { parseOpenGraph, proxiedImageUrl, siteIconUrl } from '@/lib/unfurl/parse';
import { getArchivedCard, noteLinkSeen } from '@/lib/posts-plus/link-rescue.server';
/**
 * /api/oembed — Resolve media URLs and extract OpenGraph metadata.
 *
 * Supports two modes via ?type= query param:
 *   - "tenor" (default): Resolve Tenor share URLs to direct GIF URLs
 *   - "og": Extract OpenGraph metadata (title, description, image) from any URL
 */
const CACHE_TTL = 60 * 60 * 24; // 24h
/** Only the document head is parsed; 64 kB covers it with room to spare. */
const HEAD_BYTES = 64 * 1024;
/** A Tenor share page keeps its og tags near the top, but is script-heavy. */
const TENOR_BYTES = 256 * 1024;

interface OgCard {
  title: string | null;
  description: string | null;
  /** Same-origin `/api/image-proxy` path, never a third-party URL. */
  image: string | null;
  /** The site's icon (same-origin proxy path): the card's picture when the page has no image. */
  icon: string | null;
  siteName: string;
}

class UpstreamError extends Error {}

/** Longest `url` we will fetch or cache; real links are far shorter. */
const MAX_URL_LENGTH = 2048;

/**
 * Cache key for a URL: sha256 of its canonical form (scheme and host
 * lowercased by `URL`, fragment dropped). Hashing bounds the key size no matter
 * what the caller sends. Query params are left in the order given: reordering
 * them is not safe in general (repeated keys, order-sensitive origins).
 */
function ogCacheKey(parsed: URL): string {
  const u = new URL(parsed.href);
  u.hash = '';
  return `oembed:og2:${createHash('sha256').update(u.href).digest('hex')}`;
}

export const route = apiRoute('/api/oembed', {
  GET: defineHandler(
    {
      auth: 'none',
      rateLimit: { limit: 30, windowMs: 60_000, prefix: 'oembed', message: 'Rate limited' },
    },
    async ({ request }) => {
      const url = new URL(request.url).searchParams.get('url');
      const type = new URL(request.url).searchParams.get('type') || 'tenor';

      if (!url) {
        return Response.json({ error: 'Missing url parameter' }, { status: 400 });
      }

      if (url.length > MAX_URL_LENGTH) {
        return Response.json({ error: 'URL too long' }, { status: 400 });
      }

      // Validate URL
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return Response.json({ error: 'Invalid URL' }, { status: 400 });
      }

      // ── Tenor resolution ──────────────────────────────────────────
      if (type === 'tenor') {
        try {
          const res = await safeFetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RmhBot/1.0)' },
            allowedHosts: ['tenor.com'],
          });

          if (!res.ok) {
            return Response.json({ error: 'Failed to fetch page' }, { status: 502 });
          }

          const html = await readCapped(res, TENOR_BYTES);

          const ogImageMatch = html.match(
            /<meta\s[^>]*property="og:image"\s[^>]*content="([^"]+)"/,
          );
          const ogImageAlt = html.match(/<meta\s[^>]*content="([^"]+)"[^>]*property="og:image"/);
          const ogVideoMatch = html.match(
            /<meta\s[^>]*property="og:video"\s[^>]*content="([^"]+)"/,
          );
          const ogVideoAlt = html.match(/<meta\s[^>]*content="([^"]+)"[^>]*property="og:video"/);

          const gifUrl = ogImageMatch?.[1] ?? ogImageAlt?.[1] ?? null;

          if (!gifUrl) {
            return Response.json({ error: 'No media found' }, { status: 404 });
          }

          return Response.json(
            { gifUrl, videoUrl: ogVideoMatch?.[1] ?? ogVideoAlt?.[1] ?? null },
            {
              headers: {
                'Cache-Control': `public, max-age=${CACHE_TTL}, stale-while-revalidate=86400`,
              },
            },
          );
        } catch (e) {
          if (e instanceof SsrfError)
            return Response.json({ error: 'Disallowed URL' }, { status: 400 });
          return Response.json({ error: 'Fetch failed' }, { status: 502 });
        }
      }

      // ── OpenGraph metadata extraction ─────────────────────────────
      if (type === 'og') {
        try {
          // X11: a link that has been dead for two checks is served from its
          // Wayback snapshot, without touching the (gone) original.
          const archived = await getArchivedCard(url);
          if (archived) {
            return Response.json(
              {
                title: archived.title,
                description: archived.description,
                image: null,
                icon: proxiedImageUrl(siteIconUrl('', url)),
                siteName: archived.siteName || new URL(url).hostname,
                archivedUrl: archived.archiveUrl,
                archivedAt: archived.archiveTimestamp,
              },
              {
                headers: {
                  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=3600',
                },
              },
            );
          }

          // Cached for 24h per URL (single-flight across concurrent callers),
          // and the body is read through a byte cap rather than `res.text()`:
          // the old code buffered whatever the origin sent and then threw all
          // but the first 50 kB away. Upstream failures are thrown, not
          // returned, so they are never cached.
          const card = await cachedNullable<OgCard>(
            ogCacheKey(parsedUrl),
            CACHE_TTL * 1000,
            async () => {
              const res = await safeFetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RmhBot/1.0)' },
                timeoutMs: 5000,
              });
              if (!res.ok) {
                void res.body?.cancel().catch(() => {});
                throw new UpstreamError();
              }
              const head = await readCapped(res, HEAD_BYTES);
              // One parser for every unfurl (lib/unfurl/parse.ts): either quote style, any
              // attribute order, entities decoded, og → twitter → <title> precedence.
              const meta = parseOpenGraph(head);
              const { title, description, siteName } = meta;
              if (!title && !description) return null;
              // X11: remember this card's link so the weekly check can watch it.
              void noteLinkSeen(url, { title, description, siteName });
              return {
                title,
                description,
                // Relative og:image paths resolve against the page; both pictures come back
                // through our own proxy, so a preview never leaks the viewer's IP.
                image: proxiedImageUrl(meta.image, url),
                icon: proxiedImageUrl(siteIconUrl(head, url)),
                siteName: siteName || new URL(url).hostname.replace(/^www\./i, ''),
              };
            },
          );
          if (!card) return Response.json({ error: 'No metadata found' }, { status: 404 });

          return Response.json(card, {
            headers: {
              'Cache-Control': `public, max-age=${CACHE_TTL}, stale-while-revalidate=86400`,
            },
          });
        } catch (e) {
          if (e instanceof SsrfError)
            return Response.json({ error: 'Disallowed URL' }, { status: 400 });
          if (e instanceof UpstreamError)
            return Response.json({ error: 'Failed to fetch page' }, { status: 502 });
          return Response.json({ error: 'Fetch failed' }, { status: 502 });
        }
      }

      return Response.json({ error: 'Invalid type parameter' }, { status: 400 });
    },
  ),
});
