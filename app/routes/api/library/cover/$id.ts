import { createFileRoute } from '@tanstack/react-router';
import { getObject } from '@/lib/storage/s3.server';
import { libraryCoverKey, isSafeLibraryId } from '@/lib/library/keys';
import {
  optimizeImage,
  parseFormat,
  negotiateFormat,
  getCachedVariant,
  setCachedVariant,
  variantCacheKey,
} from '@/lib/image-optimize';

/**
 * GET /api/library/cover/$id — stream an uploaded book's cover image from R2.
 * Supports on-demand resize/re-encode (w/h/q/f) so covers can be served at
 * shelf size (and as tiny blur placeholders) instead of full resolution.
 */
export const Route = createFileRoute('/api/library/cover/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
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
            const width = wParam ? Math.min(parseInt(wParam, 10), 2048) : undefined;
            const height = hParam ? Math.min(parseInt(hParam, 10), 2048) : undefined;
            const quality = qParam ? Math.min(Math.max(parseInt(qParam, 10), 1), 100) : 80;
            const format = parseFormat(fParam) ?? negotiateFormat(request.headers.get('accept'));

            // Checked before the storage read, so a hit costs neither an R2 GET
            // nor a sharp encode. The shelf renders every cover twice (blur
            // placeholder + full), so this path is hit hard on a cold cache.
            const cacheKey = variantCacheKey('library-cover', storageKey, {
              width,
              height,
              quality,
              format,
            });
            const cached = getCachedVariant(cacheKey);
            if (cached) {
              return new Response(cached.buffer as unknown as BodyInit, {
                headers: {
                  'Content-Type': cached.contentType,
                  'Cache-Control': 'public, max-age=31536000, immutable',
                  'Access-Control-Allow-Origin': '*',
                  // Required: the format was negotiated from Accept.
                  'Vary': 'Accept',
                },
              });
            }

            const object = await getObject(storageKey);
            if (!object) return new Response('Not Found', { status: 404 });

            const result = await optimizeImage(object.body, { width, height, quality, format });
            setCachedVariant(cacheKey, {
              buffer: result.buffer,
              contentType: result.contentType,
            });
            return new Response(result.buffer as unknown as BodyInit, {
              headers: {
                'Content-Type': result.contentType,
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Access-Control-Allow-Origin': '*',
                'Vary': 'Accept',
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
    },
  },
});
