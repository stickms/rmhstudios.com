import { createFileRoute } from '@tanstack/react-router';
import { LRUCache } from 'lru-cache';
import { optimizeImage, parseFormat, negotiateFormat } from '@/lib/image-optimize';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { safeFetch, SsrfError } from '@/lib/ssrf-guard.server';
import { isDiscordAvatarUrl, refreshDiscordAvatarFromBrokenUrl } from '@/lib/discord-avatar-refresh.server';

const MAX_UPSTREAM_BYTES = 10 * 1024 * 1024; // 10 MB

// Origin-side cache of OPTIMIZED images, keyed by (url, w, h, q, format)
// (perf audit §1.2). The proxy path has no file extension, so Cloudflare doesn't
// cache it by default and every browser's first request for each avatar/width
// hit sharp on the single web event loop. This absorbs the repeats at origin:
// a cache hit skips the upstream fetch AND the decode/resize/encode entirely.
// Bounded by total bytes (optimized avatars are ~5-20KB, so this holds many
// thousands) and kept well under the container memory limit; per-process, so it
// complements — doesn't replace — the recommended Cloudflare cache rule.
type CachedImage = { buffer: Uint8Array; contentType: string };
const imageCache = new LRUCache<string, CachedImage>({
  maxSize: 64 * 1024 * 1024, // 64 MB of optimized image bytes
  sizeCalculation: (v) => v.buffer.byteLength + v.contentType.length + 64,
  ttl: 60 * 60_000, // 1 hour
});

export const Route = createFileRoute('/api/image-proxy')({
  server: {
    handlers: {
  GET: async ({ request }) => {
    try {
      // Per-IP rate limit: this endpoint fetches arbitrary upstream URLs, so cap
      // request volume to blunt SSRF probing / bandwidth abuse (mirrors oembed).
      const { allowed, retryAfter } = rateLimit(getClientIp(request), {
        limit: 60,
        windowMs: 60_000,
        prefix: 'image-proxy',
      });
      if (!allowed) {
        return Response.json(
          { error: 'Too many requests' },
          { status: 429, headers: { 'Retry-After': String(retryAfter) } },
        );
      }

      const url = new URL(request.url);
      const src = url.searchParams.get('url');

      if (!src) {
        return Response.json({ error: 'Invalid or missing url parameter' }, { status: 400 });
      }

      const wParam = url.searchParams.get('w');
      const hParam = url.searchParams.get('h');
      const qParam = url.searchParams.get('q');
      const fParam = url.searchParams.get('f');

      // Resolve the transform params up front (they don't depend on the bytes) so
      // we can check the origin cache before doing any upstream fetch / transcode.
      const width = wParam ? Math.min(parseInt(wParam, 10), 2000) : undefined;
      const height = hParam ? Math.min(parseInt(hParam, 10), 2000) : undefined;
      const quality = qParam ? Math.min(Math.max(parseInt(qParam, 10), 1), 100) : 80;
      const format = parseFormat(fParam) ?? negotiateFormat(request.headers.get('accept'));

      const cacheKey = `${src}|w=${width ?? ''}|h=${height ?? ''}|q=${quality}|f=${format ?? ''}`;
      const hit = imageCache.get(cacheKey);
      if (hit) {
        return new Response(hit.buffer as unknown as BodyInit, {
          status: 200,
          headers: {
            'Content-Type': hit.contentType,
            'Cache-Control': 'public, max-age=2592000, stale-while-revalidate=2592000',
            'Access-Control-Allow-Origin': '*',
            'Vary': 'Accept',
            'X-Image-Proxy-Cache': 'HIT',
          },
        });
      }

      // Fetch the upstream image (SSRF-guarded: https only, blocks private IPs)
      let upstream: Response;
      try {
        upstream = await safeFetch(src, {
          headers: { 'User-Agent': 'RMHStudios-ImageProxy/1.0' },
          timeoutMs: 10_000,
        });
      } catch (e) {
        if (e instanceof SsrfError) {
          return Response.json({ error: 'Disallowed image URL' }, { status: 400 });
        }
        throw e;
      }

      if (!upstream.ok) {
        // A stale Discord avatar (the hash changed after the user updated it).
        // Lazily refresh it from Discord in the background — guarded + rate-limited.
        if (isDiscordAvatarUrl(src)) {
          void refreshDiscordAvatarFromBrokenUrl(src);
        }
        return Response.json({ error: 'Failed to fetch upstream image' }, { status: 502 });
      }

      const contentType = upstream.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) {
        return Response.json({ error: 'URL does not point to an image' }, { status: 400 });
      }

      const arrayBuffer = await upstream.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_UPSTREAM_BYTES) {
        return Response.json({ error: 'Image too large' }, { status: 413 });
      }

      const buffer = Buffer.from(arrayBuffer);

      const result = await optimizeImage(buffer, { width, height, quality, format });

      // Populate the origin cache so repeat requests for this (url,w,h,q,f) skip
      // both the upstream fetch and the sharp transcode.
      imageCache.set(cacheKey, { buffer: result.buffer, contentType: result.contentType });

      return new Response(result.buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': result.contentType,
          // Proxied images are keyed by the (url, w, h, q, f) tuple and the
          // upstreams we proxy (Discord/gstatic/cloudinary) carry the version in
          // the URL, so a changed image is a changed key — cache aggressively.
          // 30d fresh + 30d stale-while-revalidate (was 1d + 7d, which Lighthouse
          // flagged as an inefficient cache lifetime).
          'Cache-Control': 'public, max-age=2592000, stale-while-revalidate=2592000',
          'Access-Control-Allow-Origin': '*',
          'Vary': 'Accept',
          'X-Image-Proxy-Cache': 'MISS',
        },
      });
    } catch (error) {
      console.error('Image proxy error:', error);
      return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  },
    },
  },
});
