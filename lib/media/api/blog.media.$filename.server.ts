import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { getObject, getObjectRange, getObjectSize } from '@/lib/storage/s3.server';
import { blogMediaKey, isSafeFilename, contentTypeForFilename } from '@/lib/storage/keys';

/**
 * GET /api/blog/media/<filename> — blog / announcement media from object
 * storage. Prod serves these from the CDN; this covers dev / no-CDN.
 *
 * Byte ranges are served (206) because Safari will not play or seek a
 * `<video>` whose source cannot answer `Range`. Filenames are random and
 * never reused, so the response is immutable.
 */
export const route = apiRoute('/api/blog/media/$filename', {
  GET: defineHandler(
    { auth: 'none', etag: false, microCache: false },
    async ({ request, params }) => {
      const { filename } = params;
      if (!filename || !isSafeFilename(filename)) return new Response('Not Found', { status: 404 });
      const key = blogMediaKey(filename);
      const headers: Record<string, string> = {
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      };

      const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range')?.trim() ?? '');
      if (match && (match[1] || match[2])) {
        const total = await getObjectSize(key);
        if (total === null) return new Response('Not Found', { status: 404 });
        // `bytes=-N` is the last N bytes.
        const start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2]));
        const end = match[1] && match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
        if (!Number.isFinite(start) || start > end || start >= total) {
          return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
        }
        const part = await getObjectRange(key, start, end);
        if (part) {
          return new Response(new Uint8Array(part.body), {
            status: 206,
            headers: {
              ...headers,
              'Content-Type': part.contentType || contentTypeForFilename(filename),
              'Content-Range': `bytes ${part.start}-${part.end}/${part.total}`,
              'Content-Length': String(part.body.length),
            },
          });
        }
        // Fall through to a whole-object read (e.g. a Brotli-encoded object).
      }

      const object = await getObject(key);
      if (!object) return new Response('Not Found', { status: 404 });
      return new Response(new Uint8Array(object.body), {
        headers: {
          ...headers,
          'Content-Type': object.contentType || contentTypeForFilename(filename),
          'Content-Length': String(object.body.length),
        },
      });
    },
  ),
});
