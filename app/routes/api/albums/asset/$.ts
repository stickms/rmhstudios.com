import { createFileRoute } from '@tanstack/react-router';
import { getObject } from '@/lib/storage/s3.server';
import { ALBUM_PREFIX, isSafeAlbumPath, contentTypeForFilename } from '@/lib/storage/keys';
import { optimizeImage, parseFormat, negotiateFormat } from '@/lib/image-optimize';

/**
 * GET /api/albums/asset/<albumId>/<file> — stream an album asset from object
 * storage. In production album media is served straight from the CDN; this proxy
 * covers dev / no-CDN (and same-origin fallbacks). Images support on-demand
 * resize/re-encode via ?w/?h/?q/?f (used for blur-up placeholders + nav thumbs).
 */
export const Route = createFileRoute('/api/albums/asset/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const marker = '/api/albums/asset/';
          const at = url.pathname.indexOf(marker);
          if (at < 0) return new Response('Not Found', { status: 404 });
          const suffix = decodeURIComponent(url.pathname.slice(at + marker.length));
          if (!isSafeAlbumPath(suffix)) return new Response('Not Found', { status: 404 });

          const object = await getObject(ALBUM_PREFIX + suffix);
          if (!object) return new Response('Not Found', { status: 404 });

          const contentType = object.contentType || contentTypeForFilename(suffix);
          const isImage = contentType.startsWith('image/');

          // On-demand image resize / re-encode (smaller variants, blur-up thumbs).
          const wParam = url.searchParams.get('w');
          const hParam = url.searchParams.get('h');
          const qParam = url.searchParams.get('q');
          const fParam = url.searchParams.get('f');
          if (isImage && (wParam || hParam || qParam || fParam)) {
            const width = wParam ? Math.min(parseInt(wParam, 10), 4096) : undefined;
            const height = hParam ? Math.min(parseInt(hParam, 10), 4096) : undefined;
            const quality = qParam ? Math.min(Math.max(parseInt(qParam, 10), 1), 100) : 80;
            const format = parseFormat(fParam) ?? negotiateFormat(request.headers.get('accept'));
            const result = await optimizeImage(object.body, { width, height, quality, format });
            return new Response(result.buffer as unknown as BodyInit, {
              headers: {
                'Content-Type': result.contentType,
                'Cache-Control': 'public, max-age=31536000, immutable',
                Vary: 'Accept',
              },
            });
          }

          return new Response(new Uint8Array(object.body), {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          });
        } catch (error) {
          console.error('Album asset serve error:', error);
          return new Response('Not Found', { status: 404 });
        }
      },
    },
  },
});
