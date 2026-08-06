import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { readSongCover } from '@/lib/slice-it/songs.server';

/**
 * A song's cover art.
 *
 * Keyed by song id rather than by filename. The old route took the filename
 * straight from the URL and read it out of `db/music/covers` — which was
 * path-guarded, so not traversable, but still meant the cover of a *private*
 * song was served to anyone who knew its filename, with no reference to the
 * song row at all. Going through the row makes the visibility rule the same one
 * the rest of the API uses, and drops a public enumeration surface.
 */
export const Route = createFileRoute('/api/slice-it/songs/$id/cover')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ params, userId }) => {
        const song = await prisma.song.findUnique({
          where: { id: params.id },
          select: { coverUrl: true, isPublic: true, uploadedBy: true },
        });

        if (!song?.coverUrl || (!song.isPublic && userId !== song.uploadedBy)) {
          return new Response('Not Found', { status: 404 });
        }

        const file = await readSongCover(song.coverUrl);
        if (!file) return new Response('Not Found', { status: 404 });

        return new Response(new Uint8Array(file.body), {
          headers: {
            'Content-Type': file.contentType,
            'Content-Length': String(file.body.length),
            // Editing a song replaces the stored object with a new key, so the
            // bytes behind a given (song, cover) pair never change — but the
            // URL is the song id, which does not change. A day is the
            // compromise: long enough to be a cache, short enough that new
            // artwork appears without a hard reload.
            'Cache-Control': song.isPublic
              ? 'public, max-age=86400, stale-while-revalidate=604800'
              : 'private, max-age=3600',
          },
        });
      }),
    },
  },
});
