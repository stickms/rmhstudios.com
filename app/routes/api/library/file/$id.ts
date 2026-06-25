import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { getObject } from '@/lib/storage/s3.server';
import { libraryFileKey, libraryContentType, isSafeLibraryId, type LibraryFormat } from '@/lib/library/keys';
import { isGzipped } from '@/lib/library/compress.server';

/**
 * GET /api/library/file/$id — stream an uploaded book (PDF or EPUB) from R2.
 *
 * Same-origin so it resolves in every environment (a bare /library/<id>.pdf only
 * works where a CDN fronts R2). The row's `format` decides the stored key and
 * content type. Returns the full body; pdf.js falls back from range to a single
 * fetch when the response isn't 206. Files are stored gzip-compressed when that
 * saves space; Content-Encoding is taken from the object's recorded encoding,
 * falling back to sniffing the gzip magic bytes for objects stored before that
 * metadata existed (and for the metadata-less local FS backend), so the browser
 * inflates them.
 */
export const Route = createFileRoute('/api/library/file/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { id } = params;
          if (!isSafeLibraryId(id)) return new Response('Not Found', { status: 404 });
          const doc = await prisma.libraryDocument.findUnique({
            where: { id },
            select: { format: true, pdfKey: true },
          });
          const format: LibraryFormat = doc?.format === 'epub' ? 'epub' : 'pdf';
          // Prefer the stored key; fall back to the conventional key for older rows.
          const key = doc?.pdfKey ?? libraryFileKey(id, format);
          const object = await getObject(key);
          if (!object) return new Response('Not Found', { status: 404 });
          const gz = object.contentEncoding === 'gzip' || isGzipped(object.body);
          const headers: Record<string, string> = {
            'Content-Type': libraryContentType(format),
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
