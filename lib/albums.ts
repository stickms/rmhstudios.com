/**
 * Album catalog for the library's "Albums" section.
 *
 * Each album bundles a set of image/video slides served as static assets from
 * /public/albums/<id>/. The slides power the fullscreen carousel viewer at
 * /library/albums/$albumId, which mirrors the share / download / zoom / video
 * playback features of the original alexpics gallery the assets came from.
 *
 * Slides are enumerated here (rather than read from disk) so the catalog is
 * SSR-friendly and works the same in dev and in the bundled production server.
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
  /** Cover thumbnail for the library card. */
  cover: string;
  /** Ordered slides (images then videos); the viewer shuffles on load. */
  slides: AlbumSlide[];
}

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

/**
 * Alex Wu — photos and clips imported from the alexpics gallery
 * (78 images: alexboba1..78.jpg, 7 videos: alexbobavid1..7.mp4).
 */
const alexWu: Album = (() => {
  const base = '/albums/alex-wu';
  const images: AlbumSlide[] = range(78).map((i) => ({
    type: 'image',
    src: `${base}/img/alexboba${i}.jpg`,
    full: `${base}/full/alexboba${i}.jpg`,
    thumb: `${base}/thumb/alexboba${i}.jpg`,
    alt: `Alex Wu Boba — photo ${i}`,
    download: `alex-wu-boba-${i}.jpg`,
  }));
  const videos: AlbumSlide[] = range(7).map((i) => ({
    type: 'video',
    src: `${base}/vid/alexbobavid${i}.mp4`,
    thumb: `${base}/thumb/alexbobavid${i}.jpg`,
    mime: 'video/mp4',
    alt: `Alex Wu Boba — video ${i}`,
    download: `alex-wu-boba-video-${i}.mp4`,
  }));
  return {
    id: 'alex-wu',
    title: 'Alex Wu Boba',
    description: 'A boba-fuelled collection of photos and clips of Alex Wu.',
    cover: `${base}/thumb/alexboba1.jpg`,
    slides: [...images, ...videos],
  };
})();

export const ALBUMS: Album[] = [alexWu];

export function getAlbum(id: string): Album | undefined {
  return ALBUMS.find((a) => a.id === id);
}

/** Count helper for cards ("85 items"). */
export function albumCount(album: Album): { images: number; videos: number; total: number } {
  const images = album.slides.filter((s) => s.type === 'image').length;
  const videos = album.slides.length - images;
  return { images, videos, total: album.slides.length };
}
