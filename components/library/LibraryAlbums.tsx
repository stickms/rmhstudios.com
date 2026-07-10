/**
 * LibraryAlbums — the "Albums" section on the library page.
 *
 * Renders a grid of album cards (currently just "Alex Wu"). Each card links to
 * the fullscreen carousel viewer at /library/albums/$albumId.
 */

import { Link } from '@tanstack/react-router';
import { Images, Play, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { albumCount, type Album } from '@/lib/albums';
import { useReveal } from '@/components/library/LibraryReveal';
import { BlurImage } from '@/components/ui/BlurImage';
import { ViewTransitionLink } from '@/components/ui/ViewTransitionLink';
import { albumCoverVTName } from '@/lib/view-transition';
import { useIntentPreload } from '@/hooks/useIntentPreload';

// How many of an album's photos to warm on hover. The viewer preloads a window
// around whatever slide it lands on, so a small head start covers the opening
// frames without pulling the whole album over the wire.
const ALBUM_PREWARM = 3;

export function LibraryAlbums({
  albums: allAlbums,
  query,
  isAdmin = false,
}: {
  albums: Album[];
  query: string;
  isAdmin?: boolean;
}) {
  const { t } = useTranslation('library');
  const q = query.trim().toLowerCase();
  const albums = q ? allAlbums.filter((a) => a.title.toLowerCase().includes(q)) : allAlbums;

  // Hide the section entirely for non-admins when there's nothing to show. Admins
  // always see it (with the create/manage button) so they have an entry point
  // even before the first album exists.
  if (albums.length === 0 && !isAdmin) return null;

  return (
    <section className="lib__section lib-albums">
      <div className="lib__section-head lib-albums__head">
        <h2 className="lib__section-title">{t('section-albums', { defaultValue: 'Albums' })}</h2>
        {isAdmin && (
          <Link
            to="/admin/albums"
            className="lib-albums__new"
            aria-label={t('manage-albums', { defaultValue: 'Create or manage albums' })}
          >
            <Plus size={13} aria-hidden="true" />
            <span className="lib-albums__new-label">{t('new-album', { defaultValue: 'New album' })}</span>
          </Link>
        )}
      </div>
      {albums.length === 0 ? (
        <div className="lib-albums__empty">
          <p>{t('no-albums-admin', { defaultValue: 'No albums yet.' })}</p>
          <Link to="/admin/albums" className="lib-albums__empty-cta">
            <Plus size={14} aria-hidden="true" />
            {t('create-first-album', { defaultValue: 'Create your first album' })}
          </Link>
        </div>
      ) : (
        <div className="lib-albums__grid" role="list">
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      )}
    </section>
  );
}

function AlbumCard({ album }: { album: Album }) {
  const { t } = useTranslation('library');
  const revealRef = useReveal();
  const { images, videos, total } = albumCount(album);

  // On hover/focus, warm the first handful of optimized photos (and video posters)
  // so the fullscreen viewer paints instantly instead of fetching on open.
  const preload = useIntentPreload(
    album.slides
      .slice(0, ALBUM_PREWARM)
      .map((s) => (s.type === 'image' ? s.src : s.thumb)),
  );

  return (
    <div ref={revealRef} className="lib-reveal" role="listitem">
      <ViewTransitionLink
        to="/library/albums/$albumId"
        params={{ albumId: album.id }}
        className="lib-album"
        aria-label={t('open-album', { title: album.title, defaultValue: 'Open {{title}}' })}
        {...preload}
      >
        <div className="lib-album__cover" style={{ viewTransitionName: albumCoverVTName(album.id) }}>
          <BlurImage
            src={album.cover}
            alt={album.title}
            fit="cover"
            width={320}
            sizes="(max-width: 640px) 50vw, 240px"
            className="absolute inset-0 z-0 h-full w-full"
            imgClassName="h-full w-full"
          />
          <span className="lib-album__count">
            <Images size={13} aria-hidden="true" />
            {t('album-item-count', { total, defaultValue: '{{total}} items' })}
          </span>
          {videos > 0 && (
            <span className="lib-album__badge" aria-hidden="true">
              <Play size={12} />
            </span>
          )}
        </div>
        <div className="lib-album__meta">
          <p className="lib-album__name">{album.title}</p>
          <p className="lib-album__sub">
            {t('album-breakdown', {
              images,
              videos,
              defaultValue: '{{images}} photos · {{videos}} videos',
            })}
          </p>
        </div>
      </ViewTransitionLink>
    </div>
  );
}
