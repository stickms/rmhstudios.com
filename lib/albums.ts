/**
 * Album catalog types for the library's "Albums" section.
 *
 * Albums are stored in the database (see lib/albums.server.ts) and their media
 * lives in object storage (R2/S3) — not in the repo / build image. These are the
 * shared, client-safe shapes the carousel viewer and the library cards consume;
 * the server layer resolves storage keys into the `src` / `full` / `thumb` URLs
 * below before handing an Album to a route loader.
 */

export type AlbumImageSlide = {
  type: 'image';
  /** Web-optimized image shown in the viewer (and the "optimized" download). */
  src: string;
  /** Full-resolution original (the "full file" download/share option). */
  full: string;
  /** Lightweight thumbnail used in the nav strip + card cover. */
  thumb: string;
  /** Accessible description. */
  alt: string;
  /** Suggested base filename when downloaded. */
  download: string;
};

export type AlbumVideoSlide = {
  type: 'video';
  /** Video file played in the viewer. */
  src: string;
  /** Poster frame used as the <video> poster + nav-strip thumbnail. */
  thumb: string;
  /** MIME type for the <video> source. */
  mime: string;
  /** Accessible description. */
  alt: string;
  /** Suggested filename when downloaded. */
  download: string;
};

export type AlbumSlide = AlbumImageSlide | AlbumVideoSlide;

export interface Album {
  /** URL slug, e.g. "alex-wu". */
  id: string;
  /** Display name shown on the card + viewer. */
  title: string;
  /** Short blurb shown on the card + used for share/OG metadata. */
  description: string;
  /** Cover thumbnail for the library card (first slide's thumb). */
  cover: string;
  /** Ordered slides (images then videos); the viewer shuffles on load. */
  slides: AlbumSlide[];
}

/** Count helper for cards ("85 items"). */
export function albumCount(album: Album): { images: number; videos: number; total: number } {
  const images = album.slides.filter((s) => s.type === 'image').length;
  const videos = album.slides.length - images;
  return { images, videos, total: album.slides.length };
}
