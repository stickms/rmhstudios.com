/**
 * /library/albums/$albumId — Album carousel viewer.
 *
 * Full-bleed (outside the _site sidebar, like the book reader) fullscreen
 * gallery for a library album. Resolves the album from the static catalog and
 * hands it to AlbumViewer, which provides shuffle / navigation / zoom / share /
 * download / video playback.
 */

import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getAlbumBySlug } from '@/lib/albums.server';
import { AlbumViewer } from '@/components/library/AlbumViewer';

const fetchAlbum = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => ({ album: await getAlbumBySlug(slug) }));

export const Route = createFileRoute('/library/albums/$albumId')({
  loader: async ({ params }) => {
    const { album } = await fetchAlbum({ data: params.albumId });
    if (!album) throw notFound();
    return { album };
  },
  head: ({ loaderData }) => {
    const album = loaderData?.album;
    const title = album ? `${album.title} | RMH Studios Albums` : 'Album | RMH Studios';
    const description = album?.description ?? 'Browse this album in the RMH Studios library.';
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: album?.title ?? 'Album' },
        { property: 'og:description', content: description },
        { property: 'og:site_name', content: 'RMH Studios' },
        ...(album ? [{ property: 'og:image', content: album.cover }] : []),
      ],
    };
  },
  component: AlbumViewerPage,
});

function AlbumViewerPage() {
  const { album } = Route.useLoaderData();
  return <AlbumViewer album={album} />;
}
