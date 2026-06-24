import { createFileRoute } from '@tanstack/react-router';
import { getObject } from '@/lib/storage/s3.server';
import { libraryPdfKey, isSafeLibraryId } from '@/lib/library/keys';
import { isGzipped } from '@/lib/library/compress.server';

/**
 * GET /api/library/file/$id — stream an uploaded book's PDF from R2.
 *
 * Same-origin so it resolves in every environment (a bare /library/<id>.pdf
 * only works where a CDN fronts R2). Returns the full body; pdf.js falls back
 * from range to a single fetch when the response isn't 206. PDFs are stored
 * gzip-compressed; when so, we set Content-Encoding so the browser inflates them.
 */
export const Route = createFileRoute('/api/library/file/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { id } = params;
          if (!isSafeLibraryId(id)) return new Response('Not Found', { status: 404 });
          const object = await getObject(libraryPdfKey(id));
          if (!object) return new Response('Not Found', { status: 404 });
          const gz = isGzipped(object.body);
          const headers: Record<string, string> = {
            'Content-Type': 'application/pdf',
            'Content-Length': String(object.body.length),
            'Content-Disposition': 'inline',
            'Cache-Control': 'public, max-age=31536000, immutable',
          };
          if (gz) headers['Content-Encoding'] = 'gzip';
          return new Response(new Uint8Array(object.body), { headers });
        } catch (error) {
          console.error('Library file serve error:', error);
          return new Response('Not Found', { status: 404 });
        }
      },
    },
  },
});
