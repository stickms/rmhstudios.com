import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { albumCount } from '@/lib/albums';
import { getAlbumBySlug } from '@/lib/albums.server';
import { renderPageCard } from '@/lib/og/page-card.server';

/**
 * GET /api/og/album/$albumId — the Open Graph card for a library album.
 *
 * The cover alone said nothing about the page, and an album with no cover unfurled as the library card. This frames
 * the cover with the album's name, its blurb and how much is in it.
 */
export const Route = createFileRoute('/api/og/album/$albumId')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ params }) => {
        const album = await getAlbumBySlug(params.albumId);
        if (!album) return new Response('Not found', { status: 404 });

        const { images, videos, total } = albumCount(album);

        const png = await renderPageCard({
          cacheKey: `album:${album.id}:${total}:${album.cover}`,
          eyebrow: 'Library album',
          title: album.title,
          subtitle: album.description,
          art: album.cover || null,
          path: `/library/albums/${album.id}`,
          stats: [
            { value: String(total), label: total === 1 ? 'item' : 'items', lead: true },
            ...(images > 0 && videos > 0
              ? [
                  { value: String(images), label: images === 1 ? 'photo' : 'photos' },
                  { value: String(videos), label: videos === 1 ? 'video' : 'videos' },
                ]
              : []),
          ],
        });

        return new Response(new Uint8Array(png), {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
          },
        });
      }),
    },
  },
});
