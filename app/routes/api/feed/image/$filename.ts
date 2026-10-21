import { createFileRoute } from '@tanstack/react-router';
import { getObject } from "@/lib/storage/s3.server";
import { feedImageKey, isSafeFilename, contentTypeForFilename } from "@/lib/storage/keys";
import { parseFormat, negotiateFormat, variantCacheKey } from "@/lib/image-optimize";
import { snapDimension, snapQuality } from "@/lib/images/variant-params";
import { busyResponse, CpuGateFullError, getOrEncodeVariant } from "@/lib/images/variants.server";

export const Route = createFileRoute('/api/feed/image/$filename')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { filename } = params;
          if (!isSafeFilename(filename)) {
            return new Response("Not Found", { status: 404 });
          }

          // On-demand resize / re-encode. Lets the feed request a small variant
          // (or a tiny blurred placeholder) instead of always shipping the full
          // 2048px stored image — a big bandwidth win on slow connections. In
          // production feed images are served straight from the CDN, so this
          // path mainly covers dev / no-CDN; the OptimizedImage component routes
          // the CDN URLs through /api/image-proxy for the same effect.
          const url = new URL(request.url);
          const wParam = url.searchParams.get('w');
          const hParam = url.searchParams.get('h');
          const qParam = url.searchParams.get('q');
          const fParam = url.searchParams.get('f');

          if (wParam || hParam || qParam || fParam) {
            // Snapped to the shared ladder, not used as sent: every distinct
            // (w, h, q) is its own cache entry and its own encode, and this
            // route is unauthenticated and unthrottled. See variant-params.ts.
            const width = snapDimension(wParam);
            const height = snapDimension(hParam);
            const quality = snapQuality(qParam);
            const format = parseFormat(fParam) ?? negotiateFormat(request.headers.get('accept'));

            // A cache hit skips both the object-store GET and the sharp encode;
            // concurrent misses for one key share a single GET + encode. Feed
            // image filenames are content-addressed and the response is
            // `immutable`, so a cached variant can't go stale.
            const key = feedImageKey(filename);
            let variant;
            try {
              variant = await getOrEncodeVariant({
                cacheKey: variantCacheKey('feed', key, { width, height, quality, format }),
                width,
                height,
                quality,
                format,
                load: async () => {
                  const object = await getObject(key);
                  return object ? { bytes: object.body } : null;
                },
              });
            } catch (e) {
              if (e instanceof CpuGateFullError) return busyResponse();
              throw e;
            }
            if (!variant || !variant.ok) {
              return new Response("Not Found", { status: 404 });
            }

            return new Response(variant.image.buffer as unknown as BodyInit, {
              headers: {
                "Content-Type": variant.image.contentType,
                "Cache-Control": "public, max-age=31536000, immutable",
                "Access-Control-Allow-Origin": "*",
                // Required: the format above was negotiated from Accept, so a
                // shared cache must key on it or it serves AVIF to Safari 15.
                "Vary": "Accept",
              },
            });
          }

          const object = await getObject(feedImageKey(filename));
          if (!object) {
            return new Response("Not Found", { status: 404 });
          }

          return new Response(new Uint8Array(object.body), {
            headers: {
              "Content-Type": object.contentType || contentTypeForFilename(filename),
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        } catch (error) {
          console.error("Feed image serve error:", error);
          return new Response("Not Found", { status: 404 });
        }
      },
    },
  },
});
