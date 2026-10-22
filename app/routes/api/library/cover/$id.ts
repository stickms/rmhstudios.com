import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getObject } from '@/lib/storage/s3.server';
import { libraryCoverKey, isSafeLibraryId } from '@/lib/library/keys';
import { parseFormat, negotiateFormat, variantCacheKey } from '@/lib/image-optimize';
import { snapCoverVariant } from '@/lib/images/variant-params';
import { busyResponse, CpuGateFullError, getOrEncodeVariant } from '@/lib/images/variants.server';

/**
 * GET /api/library/cover/$id — stream an uploaded book's cover image from R2.
 * Supports on-demand resize/re-encode (w/h/q/f) so covers can be served at
 * shelf size (and as tiny blur placeholders) instead of full resolution.
 */
export const Route = createFileRoute('/api/library/cover/$id')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          // Generous (a shelf is dozens of covers, each fetched twice cold) but
          // finite: cache hits are cheap, cold encodes are not.
          rateLimit: {
            limit: 600,
            windowMs: 60_000,
            prefix: 'library-cover',
            message: 'Rate limited',
          },
        },
        async ({ request, params }) => {
          try {
            const { id } = params;
            if (!isSafeLibraryId(id)) return new Response('Not Found', { status: 404 });

            const url = new URL(request.url);
            const wParam = url.searchParams.get('w');
            const hParam = url.searchParams.get('h');
            const qParam = url.searchParams.get('q');
            const fParam = url.searchParams.get('f');

            const storageKey = libraryCoverKey(id);

            if (wParam || hParam || qParam || fParam) {
              // Snapped jointly to a few cover presets, not used as sent: every
              // distinct (w, h, q) is its own cache entry and its own sharp encode.
              // See snapCoverVariant in variant-params.ts.
              const { width, height, quality } = snapCoverVariant(wParam, hParam, qParam);
              const format = parseFormat(fParam) ?? negotiateFormat(request.headers.get('accept'));

              // A hit skips the R2 GET and the sharp encode; concurrent misses for
              // one key share a single GET + gated encode (the shelf renders every
              // cover twice - blur placeholder + full - so this is hit hard cold).
              let variant;
              try {
                variant = await getOrEncodeVariant({
                  cacheKey: variantCacheKey('library-cover', storageKey, {
                    width,
                    height,
                    quality,
                    format,
                  }),
                  width,
                  height,
                  quality,
                  format,
                  load: async () => {
                    const object = await getObject(storageKey);
                    return object ? { bytes: object.body } : null;
                  },
                });
              } catch (e) {
                if (e instanceof CpuGateFullError) return busyResponse();
                throw e;
              }
              if (!variant || !variant.ok) return new Response('Not Found', { status: 404 });

              return new Response(variant.image.buffer as unknown as BodyInit, {
                headers: {
                  'Content-Type': variant.image.contentType,
                  'Cache-Control': 'public, max-age=31536000, immutable',
                  'Access-Control-Allow-Origin': '*',
                  // Required: the format was negotiated from Accept.
                  Vary: 'Accept',
                },
              });
            }

            const object = await getObject(storageKey);
            if (!object) return new Response('Not Found', { status: 404 });

            return new Response(new Uint8Array(object.body), {
              headers: {
                'Content-Type': object.contentType || 'image/jpeg',
                'Content-Length': String(object.body.length),
                'Cache-Control': 'public, max-age=31536000, immutable',
              },
            });
          } catch (error) {
            console.error('Library cover serve error:', error);
            return new Response('Not Found', { status: 404 });
          }
        },
      ),
    },
  },
});
