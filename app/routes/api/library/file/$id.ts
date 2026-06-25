import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { getObject } from '@/lib/storage/s3.server';
import {
  libraryFileKey,
  libraryPdfKey,
  libraryContentType,
  isSafeLibraryId,
  type LibraryFormat,
} from '@/lib/library/keys';
import { decompressStored } from '@/lib/library/compress.server';

/**
 * GET /api/library/file/$id — stream an uploaded book (PDF or EPUB) from R2.
 *
 * Same-origin so it resolves in every environment (a bare /library/<id>.pdf only
 * works where a CDN fronts R2). The row's `format` decides the content type.
 *
 * Robustness, because uploads were 404-ing in the wild:
 *  - We probe the recorded `pdfKey` first, then the conventional keys, so a row
 *    whose stored key drifted (legacy/null pdfKey, or a format mismatch) still
 *    resolves instead of 404-ing.
 *  - Files are stored gzip-compressed when that saves space, but we INFLATE them
 *    here and serve identity bytes rather than passing `Content-Encoding: gzip`
 *    through — a CDN/proxy that strips or double-applies the encoding was leaving
 *    the browser with compressed bytes pdf.js couldn't parse.
 *  - HTTP Range is honoured so pdf.js can stream/seek large files.
 *  - A genuine miss is a 404; an unexpected error is a 500 (and is never cached
 *    as immutable), so a transient storage hiccup can be retried, not pinned.
 */
export const Route = createFileRoute('/api/library/file/$id')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { id } = params;
        if (!isSafeLibraryId(id)) return new Response('Not Found', { status: 404 });

        let doc: { format: string | null; pdfKey: string | null } | null;
        try {
          doc = await prisma.libraryDocument.findUnique({
            where: { id },
            select: { format: true, pdfKey: true },
          });
        } catch (error) {
          console.error('Library file lookup error:', error);
          return new Response('Server Error', { status: 500 });
        }

        const format: LibraryFormat = doc?.format === 'epub' ? 'epub' : 'pdf';
        const other: LibraryFormat = format === 'pdf' ? 'epub' : 'pdf';
        // Recorded key first, then conventional keys for both formats.
        const candidates = Array.from(
          new Set(
            [doc?.pdfKey ?? undefined, libraryFileKey(id, format), libraryFileKey(id, other), libraryPdfKey(id)].filter(
              (k): k is string => Boolean(k),
            ),
          ),
        );

        let stored: Buffer | null = null;
        try {
          for (const key of candidates) {
            const object = await getObject(key);
            if (object) {
              stored = object.body;
              break;
            }
          }
        } catch (error) {
          console.error('Library file fetch error:', error);
          return new Response('Server Error', { status: 500 });
        }
        if (!stored) return new Response('Not Found', { status: 404 });

        const body = decompressStored(stored);
        const total = body.length;
        const headers: Record<string, string> = {
          'Content-Type': libraryContentType(format),
          'Content-Disposition': 'inline',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Accept-Ranges': 'bytes',
        };

        // Single-range support so pdf.js can stream and seek large books.
        const range = request.headers.get('range');
        const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
        if (m && (m[1] || m[2])) {
          let start = m[1] ? parseInt(m[1], 10) : 0;
          let end = m[2] ? parseInt(m[2], 10) : total - 1;
          if (Number.isNaN(start)) start = 0;
          if (Number.isNaN(end) || end >= total) end = total - 1;
          if (start > end || start >= total) {
            return new Response('Range Not Satisfiable', {
              status: 416,
              headers: { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes' },
            });
          }
          const chunk = body.subarray(start, end + 1);
          return new Response(new Uint8Array(chunk), {
            status: 206,
            headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(chunk.length) },
          });
        }

        return new Response(new Uint8Array(body), {
          headers: { ...headers, 'Content-Length': String(total) },
        });
      },
    },
  },
});
