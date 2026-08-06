import { createFileRoute } from '@tanstack/react-router';
import { getObject } from "@/lib/storage/s3.server";
import { feedImageKey, isSafeFilename, contentTypeForFilename } from "@/lib/storage/keys";
import {
  optimizeImage,
  parseFormat,
  negotiateFormat,
  getCachedVariant,
  setCachedVariant,
  variantCacheKey,
} from "@/lib/image-optimize";

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
            const width = wParam ? Math.min(parseInt(wParam, 10), 2048) : undefined;
            const height = hParam ? Math.min(parseInt(hParam, 10), 2048) : undefined;
            const quality = qParam ? Math.min(Math.max(parseInt(qParam, 10), 1), 100) : 80;
            const format = parseFormat(fParam) ?? negotiateFormat(request.headers.get('accept'));

            // Checked BEFORE the storage read: a hit skips both the R2 GET and
            // the sharp encode. Feed image filenames are content-addressed and
            // the response is `immutable`, so a cached variant can't go stale.
            const key = feedImageKey(filename);
            const cacheKey = variantCacheKey('feed', key, { width, height, quality, format });
            const cached = getCachedVariant(cacheKey);
            if (cached) {
              return new Response(cached.buffer as unknown as BodyInit, {
                headers: {
                  "Content-Type": cached.contentType,
                  "Cache-Control": "public, max-age=31536000, immutable",
                  "Access-Control-Allow-Origin": "*",
                  // Required: the format above was negotiated from Accept, so a
                  // shared cache must key on it or it serves AVIF to Safari 15.
                  "Vary": "Accept",
                },
              });
            }

            const object = await getObject(key);
            if (!object) {
              return new Response("Not Found", { status: 404 });
            }

            const result = await optimizeImage(object.body, {
              width,
              height,
              quality,
              format,
            });

            setCachedVariant(cacheKey, {
              buffer: result.buffer,
              contentType: result.contentType,
            });

            return new Response(result.buffer as unknown as BodyInit, {
              headers: {
                "Content-Type": result.contentType,
                "Cache-Control": "public, max-age=31536000, immutable",
                "Access-Control-Allow-Origin": "*",
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
