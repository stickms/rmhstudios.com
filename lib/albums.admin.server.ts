/**
 * RMH Studios — Album administration (server-only).
 *
 * Create/edit/delete albums and add/remove slides. Images are compressed to
 * three WebP variants (full / web / thumb); videos are transcoded to a compact
 * MP4 with a poster frame. All media is written to object storage under the
 * `albums/<albumId>/` key space — never the repo or the build image. Shared by
 * the admin upload endpoints and the one-off asset migration script.
 */

import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { prisma } from '@/lib/prisma.server';
import { putObject, deleteObject } from '@/lib/storage/s3.server';
import { purgeFromCdn } from '@/lib/storage/cdn.server';
import { albumAssetKey } from '@/lib/storage/keys';
import { optimizeImage } from '@/lib/image-optimize';
import { compressVideo } from '@/lib/video-optimize.server';

// Image variant sizing. "full" is a high-quality WebP near original resolution
// (the share/download "full file"); "src" is the in-viewer image; "thumb" backs
// the nav strip + card cover (and the blur-up placeholder via ?w=).
const FULL_MAX_DIM = 4096;
const SRC_MAX_DIM = 1600;
const THUMB_MAX_DIM = 400;
const QUALITY_FULL = 90;
const QUALITY_SRC = 82;
const QUALITY_THUMB = 70;

export type SlideRecord = {
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

/** Lowercase, hyphenated slug from a title; "album" when nothing usable remains. */
export function slugifyAlbum(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'album';
}

/** First free slug: `base`, else `base-2`, `base-3`, … (DB-checked). */
export async function uniqueAlbumSlug(title: string): Promise<string> {
  const base = slugifyAlbum(title);
  if (!(await prisma.album.findUnique({ where: { slug: base }, select: { id: true } }))) return base;
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.album.findUnique({ where: { slug: `${base}-${n}` }, select: { id: true } })) n++;
  return `${base}-${n}`;
}

/** Existing slide with this idempotency key, if any (for retry-safe uploads). */
async function existingByUploadKey(albumId: string, uploadKey?: string): Promise<SlideRecord | null> {
  if (!uploadKey) return null;
  return (await prisma.albumSlide.findFirst({
    where: { albumId, uploadKey },
    select: SLIDE_RECORD_SELECT,
  })) as SlideRecord | null;
}

type SlideData = {
  id: string;
  albumId: string;
  type: string;
  fullKey?: string;
  srcKey: string;
  thumbKey: string;
  mime?: string;
  alt: string;
  download: string;
  uploadKey: string | null;
};

/**
 * Create a slide, assigning the next position atomically. A per-album Postgres
 * advisory lock (held only for this short DB transaction, not during media
 * processing) serializes concurrent uploads so positions never collide. If the
 * (albumId, uploadKey) unique constraint trips — a retry that already committed —
 * the existing slide is returned instead of erroring.
 */
async function commitSlide(data: SlideData): Promise<SlideRecord> {
  try {
    return (await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`album:${data.albumId}`}))`;
      const last = await tx.albumSlide.findFirst({
        where: { albumId: data.albumId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const position = last ? last.position + 1 : 0;
      return tx.albumSlide.create({ data: { ...data, position }, select: SLIDE_RECORD_SELECT });
    })) as SlideRecord;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002' && data.uploadKey) {
      const existing = await existingByUploadKey(data.albumId, data.uploadKey);
      if (existing) return existing;
    }
    throw err;
  }
}

async function placeholderPosterWebp(): Promise<Buffer> {
  // Used only when a video has no extractable poster (e.g. ffmpeg unavailable
  // in dev) so thumbKey is always a valid image.
  return sharp({
    create: { width: 400, height: 225, channels: 3, background: { r: 18, g: 18, b: 24 } },
  })
    .webp({ quality: 60 })
    .toBuffer();
}

/**
 * Compress a raw image to full/web/thumb WebP, upload all three, and create the
 * slide row. Returns the created slide.
 */
export async function addImageSlide(
  albumId: string,
  raw: Buffer,
  opts: { alt?: string; download?: string; uploadKey?: string } = {}
): Promise<SlideRecord> {
  const dup = await existingByUploadKey(albumId, opts.uploadKey);
  if (dup) return dup; // idempotent: a retried upload resolves to the same slide
  const slideId = nanoid();
  const [full, src, thumb] = await Promise.all([
    optimizeImage(raw, { width: FULL_MAX_DIM, height: FULL_MAX_DIM, quality: QUALITY_FULL, format: 'webp', autoOrient: true }),
    optimizeImage(raw, { width: SRC_MAX_DIM, height: SRC_MAX_DIM, quality: QUALITY_SRC, format: 'webp', autoOrient: true }),
    optimizeImage(raw, { width: THUMB_MAX_DIM, height: THUMB_MAX_DIM, quality: QUALITY_THUMB, format: 'webp', autoOrient: true }),
  ]);
  const fullKey = albumAssetKey(albumId, `${slideId}-full.webp`);
  const srcKey = albumAssetKey(albumId, `${slideId}-src.webp`);
  const thumbKey = albumAssetKey(albumId, `${slideId}-thumb.webp`);
  await Promise.all([
    putObject(fullKey, full.buffer, full.contentType),
    putObject(srcKey, src.buffer, src.contentType),
    putObject(thumbKey, thumb.buffer, thumb.contentType),
  ]);
  return commitSlide({
    id: slideId,
    albumId,
    type: 'image',
    fullKey,
    srcKey,
    thumbKey,
    alt: opts.alt ?? '',
    download: opts.download || `${slideId}.webp`,
    uploadKey: opts.uploadKey ?? null,
  });
}

/**
 * Compress a raw video to MP4 (falling back to the original bytes if ffmpeg is
 * unavailable), upload it + a poster-frame WebP thumb, and create the slide row.
 */
export async function addVideoSlide(
  albumId: string,
  raw: Buffer,
  opts: { alt?: string; download?: string; uploadKey?: string } = {}
): Promise<SlideRecord> {
  const dup = await existingByUploadKey(albumId, opts.uploadKey);
  if (dup) return dup; // idempotent: a retried upload resolves to the same slide
  const slideId = nanoid();
  let videoBuf = raw;
  let mime = 'video/mp4';
  let ext = '.mp4';
  let posterRaw: Buffer | null = null;
  try {
    const compressed = await compressVideo(raw);
    videoBuf = compressed.buffer;
    mime = compressed.contentType;
    ext = compressed.ext;
    posterRaw = compressed.poster;
  } catch (err) {
    // ffmpeg missing (dev) or encode failed — store the original bytes so the
    // upload still succeeds. Production has ffmpeg, so this is a dev-only path.
    console.warn('[albums] video compression failed, storing original:', err);
  }

  const srcKey = albumAssetKey(albumId, `${slideId}-src${ext}`);
  const thumbKey = albumAssetKey(albumId, `${slideId}-thumb.webp`);
  const thumb = await optimizeImage(posterRaw ?? (await placeholderPosterWebp()), {
    width: THUMB_MAX_DIM,
    height: THUMB_MAX_DIM,
    quality: QUALITY_THUMB,
    format: 'webp',
  });
  await Promise.all([
    putObject(srcKey, videoBuf, mime),
    putObject(thumbKey, thumb.buffer, thumb.contentType),
  ]);
  return commitSlide({
    id: slideId,
    albumId,
    type: 'video',
    srcKey,
    thumbKey,
    mime,
    alt: opts.alt ?? '',
    download: opts.download || `${slideId}.mp4`,
    uploadKey: opts.uploadKey ?? null,
  });
}

const SLIDE_RECORD_SELECT = {
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

/** Storage keys backing a slide (skipping empties). */
function slideKeys(s: { fullKey: string | null; srcKey: string; thumbKey: string }): string[] {
  return [s.fullKey, s.srcKey, s.thumbKey].filter((k): k is string => Boolean(k));
}

async function removeKeys(keys: string[]): Promise<void> {
  await Promise.all(
    keys.map(async (key) => {
      await deleteObject(key).catch(() => {});
      await purgeFromCdn(key).catch(() => {});
    })
  );
}

/** Delete a single slide + its stored objects. Returns true if it existed. */
export async function deleteSlide(albumId: string, slideId: string): Promise<boolean> {
  const slide = await prisma.albumSlide.findFirst({
    where: { id: slideId, albumId },
    select: { id: true, fullKey: true, srcKey: true, thumbKey: true },
  });
  if (!slide) return false;
  await removeKeys(slideKeys(slide));
  await prisma.albumSlide.delete({ where: { id: slide.id } });
  return true;
}

/** Delete an album, all its slides, and every stored object. */
export async function deleteAlbum(albumId: string): Promise<boolean> {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    select: { id: true, slides: { select: { fullKey: true, srcKey: true, thumbKey: true } } },
  });
  if (!album) return false;
  await removeKeys(album.slides.flatMap(slideKeys));
  await prisma.album.delete({ where: { id: album.id } }); // cascades slide rows
  return true;
}

/** Persist a new slide order (ids in their desired order) within one album. */
export async function reorderSlides(albumId: string, orderedIds: string[]): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.albumSlide.updateMany({ where: { id, albumId }, data: { position: i } })
    )
  );
}

/** Persist a new album order (album ids in their desired order). */
export async function reorderAlbums(orderedIds: string[]): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((id, i) => prisma.album.updateMany({ where: { id }, data: { position: i } }))
  );
}
