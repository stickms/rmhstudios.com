import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { readSongAudio } from '@/lib/slice-it/songs.server';

/**
 * Audio streaming, with byte ranges so the player can seek.
 *
 * ## Fixes over the previous version
 *
 * - It read the file off the web container's local disk. Blue/green deploys
 *   mean the file may be on the *other* container; reads go through the storage
 *   layer now.
 * - The non-range branch sent no `Accept-Ranges`, so a browser that would have
 *   used ranges never asked, and every seek re-downloaded the whole track.
 * - The range parser rejected two legal forms: an open-ended `bytes=500-`
 *   worked only by accident, and a suffix range (`bytes=-1024`, "the last N
 *   bytes") produced `NaN` and a 416. An `end` past the file, which RFC 9110
 *   says to clamp, was also a 416.
 * - It built a `ReadableStream` around a Node stream with no backpressure —
 *   `controller.enqueue` on every `data` event regardless of `desiredSize` —
 *   which buffers the whole requested range in memory anyway. The storage layer
 *   hands back a Buffer, so slicing it is the same memory and much less
 *   machinery.
 * - There were no cache headers, so replaying a song re-fetched megabytes.
 */
export const Route = createFileRoute('/api/slice-it/songs/stream/$id')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ request, params, userId }) => {
        const song = await prisma.song.findUnique({
          where: { id: params.id },
          select: { audioUrl: true, isPublic: true, uploadedBy: true },
        });

        // 404 rather than 403 for a private song: whether a given id exists is
        // itself information, and no legitimate caller needs it.
        if (!song || (!song.isPublic && userId !== song.uploadedBy)) {
          return Response.json({ error: 'Not found' }, { status: 404 });
        }

        const file = await readSongAudio(song.audioUrl);
        if (!file) {
          return Response.json({ error: 'Audio unavailable' }, { status: 404 });
        }

        const total = file.body.length;
        // A song's audio never changes once uploaded — a re-upload is a new id
        // — so it is safe to cache indefinitely. Private songs stay out of
        // shared caches.
        const cacheControl = song.isPublic
          ? 'public, max-age=31536000, immutable'
          : 'private, max-age=3600';

        const range = request.headers.get('range');
        if (!range) {
          return new Response(new Uint8Array(file.body), {
            headers: {
              'Content-Type': file.contentType,
              'Content-Length': String(total),
              'Accept-Ranges': 'bytes',
              'Cache-Control': cacheControl,
            },
          });
        }

        const parsed = parseRange(range, total);
        if (!parsed) {
          return new Response(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes' },
          });
        }

        const { start, end } = parsed;
        const chunk = file.body.subarray(start, end + 1);
        return new Response(new Uint8Array(chunk), {
          status: 206,
          headers: {
            'Content-Type': file.contentType,
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Content-Length': String(chunk.length),
            'Accept-Ranges': 'bytes',
            'Cache-Control': cacheControl,
          },
        });
      }),
    },
  },
});

/**
 * Parse a single-range `Range` header. Returns null for anything unsatisfiable.
 *
 * Multi-range requests (`bytes=0-99,200-299`) are deliberately not supported —
 * they require a multipart response and no audio element sends one — so they
 * fall through to null and a 416, which clients handle by retrying without the
 * header.
 */
function parseRange(header: string, total: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  let start: number;
  let end: number;

  if (rawStart === '') {
    // Suffix range: the last N bytes.
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? total - 1 : Number(rawEnd);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || start >= total) return null;
  end = Math.min(end, total - 1);
  if (end < start) return null;
  return { start, end };
}
