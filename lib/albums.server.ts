/**
 * RMH Studios — Album data layer (server-only).
 *
 * Albums + their slides live in the database (Album / AlbumSlide). Heavy media
 * (photos, videos, originals) lives in object storage under the `albums/` key
 * space — never in the repo or the build image. This module reads the DB and
 * resolves each slide's storage keys into browser URLs (CDN in prod, the
 * /api/albums/asset proxy in dev) so route loaders get the same `Album` shape
 * the carousel viewer + library cards already consume.
 */

import { prisma } from '@/lib/prisma.server';
import { albumAssetUrl } from '@/lib/storage/keys';
import type { Album, AlbumSlide } from '@/lib/albums';

const SLIDE_SELECT = {
  id: true,
  type: true,
  position: true,
  fullKey: true,
  srcKey: true,
  thumbKey: true,
  mime: true,
  alt: true,
  download: true,
} as const;

const ALBUM_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  position: true,
  createdAt: true,
  slides: { select: SLIDE_SELECT, orderBy: { position: 'asc' } },
} as const;

type SlideRow = {
  id: string;
  type: string;
  position: number;
  fullKey: string | null;
  srcKey: string;
  thumbKey: string;
  mime: string | null;
  alt: string;
  download: string;
};

type AlbumRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  position: number;
  createdAt: Date;
  slides: SlideRow[];
};

function mapSlide(s: SlideRow): AlbumSlide {
  if (s.type === 'video') {
    return {
      type: 'video',
      src: albumAssetUrl(s.srcKey),
      thumb: albumAssetUrl(s.thumbKey),
      mime: s.mime || 'video/mp4',
      alt: s.alt,
      download: s.download,
    };
  }
  return {
    type: 'image',
    src: albumAssetUrl(s.srcKey),
    full: albumAssetUrl(s.fullKey || s.srcKey),
    thumb: albumAssetUrl(s.thumbKey),
    alt: s.alt,
    download: s.download,
  };
}

/** Map a DB album row (with ordered slides) to the public `Album` shape. */
function mapAlbum(a: AlbumRow): Album {
  const slides = a.slides.map(mapSlide);
  return {
    id: a.slug,
    title: a.title,
    description: a.description,
    cover: slides[0]?.thumb ?? '',
    slides,
  };
}

/**
 * Public album list for the library page. Empty albums (created but not yet
 * populated) are hidden from the public grid; admins manage them in the panel.
 */
export async function listAlbums(): Promise<Album[]> {
  const rows = (await prisma.album.findMany({
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: ALBUM_SELECT,
  })) as AlbumRow[];
  return rows.map(mapAlbum).filter((a) => a.slides.length > 0);
}

/** A single album by slug for the carousel viewer, or null if missing/empty. */
export async function getAlbumBySlug(slug: string): Promise<Album | null> {
  const row = (await prisma.album.findUnique({
    where: { slug },
    select: ALBUM_SELECT,
  })) as AlbumRow | null;
  if (!row || row.slides.length === 0) return null;
  return mapAlbum(row);
}
