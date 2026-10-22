import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { parseFormat, negotiateFormat, variantCacheKey } from '@/lib/image-optimize';
import { snapDimension, snapQuality } from '@/lib/images/variant-params';
import { busyResponse, CpuGateFullError, getOrEncodeVariant } from '@/lib/images/variants.server';
import { safeFetch, SsrfError } from '@/lib/ssrf-guard.server';
import {
  isDiscordAvatarUrl,
  refreshDiscordAvatarFromBrokenUrl,
} from '@/lib/discord-avatar-refresh.server';

const MAX_UPSTREAM_BYTES = 10 * 1024 * 1024; // 10 MB

// Origin-side cache of OPTIMIZED images, keyed by (url, w, h, q, format)
// (perf audit §1.2). The proxy path has no file extension, so Cloudflare doesn't
// cache it by default and every browser's first request for each avatar/width
// hit sharp on the single web event loop. This absorbs the repeats at origin:
// a cache hit skips the upstream fetch AND the decode/resize/encode entirely.
// The pool itself now lives in `lib/image-optimize` and is shared with the other
// on-demand resize routes, so the byte budget is one number for the container
// rather than one per endpoint; per-process, so it complements — doesn't
// replace — the recommended Cloudflare cache rule.
//
// Misses go through `getOrEncodeVariant` (lib/images/variants.server.ts):
// concurrent requests for one key share one upstream fetch + encode. The fetch
// runs in the load gate (bounded buffers, hard body deadline below); only the
// encode is admitted through the CPU gate.

export const Route = createFileRoute('/api/image-proxy')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: { limit: 60, windowMs: 60_000, prefix: 'image-proxy' } },
        async ({ request }) => {
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
          // Snapped to the shared ladder (lib/images/variant-params.ts): every
          // distinct (w, h, q) is a separate upstream fetch + encode for one URL.
          const width = snapDimension(wParam);
          const height = snapDimension(hParam);
          const quality = snapQuality(qParam);
          const format = parseFormat(fParam) ?? negotiateFormat(request.headers.get('accept'));

          const cacheKey = variantCacheKey('proxy', src, { width, height, quality, format });

          let variant;
          try {
            variant = await getOrEncodeVariant({
              cacheKey,
              width,
              height,
              quality,
              format,
              // Runs once per key however many requests are waiting on it, in
              // the load gate (not the CPU gate): it is a network fetch.
              load: async () => {
                // Fetch the upstream image (SSRF-guarded: https only, blocks private IPs)
                let upstream: Response;
                try {
                  upstream = await safeFetch(src, {
                    headers: { 'User-Agent': 'RMHStudios-ImageProxy/1.0' },
                    timeoutMs: 10_000,
                    // Covers the BODY too: without it a dripping server holds a
                    // load slot for undici's 300 s bodyTimeout.
                    bodyTimeoutMs: 15_000,
                  });
                } catch (e) {
                  if (e instanceof SsrfError) {
                    return { fail: { status: 400, body: { error: 'Disallowed image URL' } } };
                  }
                  throw e;
                }

                if (!upstream.ok) {
                  // A stale Discord avatar (the hash changed after the user updated it).
                  // Lazily refresh it from Discord in the background — guarded + rate-limited.
                  if (isDiscordAvatarUrl(src)) {
                    void refreshDiscordAvatarFromBrokenUrl(src);
                  }
                  return {
                    fail: { status: 502, body: { error: 'Failed to fetch upstream image' } },
                  };
                }

                const contentType = upstream.headers.get('content-type') || '';
                if (!contentType.startsWith('image/')) {
                  return {
                    fail: { status: 400, body: { error: 'URL does not point to an image' } },
                  };
                }

                const arrayBuffer = await upstream.arrayBuffer();
                if (arrayBuffer.byteLength > MAX_UPSTREAM_BYTES) {
                  return { fail: { status: 413, body: { error: 'Image too large' } } };
                }

                return { bytes: Buffer.from(arrayBuffer) };
              },
            });
          } catch (e) {
            if (e instanceof CpuGateFullError) return busyResponse();
            throw e;
          }

          // `load` never returns null (a missing upstream is a `fail`), but the
          // type allows it.
          if (!variant) {
            return Response.json({ error: 'Failed to fetch upstream image' }, { status: 502 });
          }
          if (!variant.ok) return Response.json(variant.body, { status: variant.status });

          return new Response(variant.image.buffer as unknown as BodyInit, {
            status: 200,
            headers: {
              'Content-Type': variant.image.contentType,
              // Proxied images are keyed by the (url, w, h, q, f) tuple and the
              // upstreams we proxy (Discord/gstatic/cloudinary) carry the version in
              // the URL, so a changed image is a changed key — cache aggressively.
              // 30d fresh + 30d stale-while-revalidate (was 1d + 7d, which Lighthouse
              // flagged as an inefficient cache lifetime).
              'Cache-Control': 'public, max-age=2592000, stale-while-revalidate=2592000',
              'Access-Control-Allow-Origin': '*',
              Vary: 'Accept',
              'X-Image-Proxy-Cache': variant.hit ? 'HIT' : 'MISS',
            },
          });
        },
      ),
    },
  },
});
