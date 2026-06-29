/**
 * One-off migration: move the bundled Alex Wu album out of public/albums/ and
 * into object storage + the database.
 *
 * For each photo it uploads the existing full / optimized / thumb files; for
 * each clip the mp4 + its poster — all verbatim (no re-encoding), keyed by a
 * fresh slide id under albums/<albumId>/. Then it seeds the Album + AlbumSlide
 * rows so the carousel serves from storage. The public/albums files can be
 * deleted afterwards.
 *
 * Usage (needs S3_* + DATABASE_URL in the environment):
 *   pnpm run albums:migrate
 *
 * Idempotent: if an album with the slug already exists it aborts (pass --force
 * to add the slides anyway).
 */

import 'dotenv/config';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { prisma } from '@/lib/prisma.server';
import { putObject, s3Configured } from '@/lib/storage/s3.server';
import { albumAssetKey, contentTypeForFilename } from '@/lib/storage/keys';

const ROOT = process.cwd();
// Where the bundled album media lives. Defaults to the in-repo public/albums,
// but can be pointed at a saved copy (e.g. after the files are removed from the
// repo) via ALBUMS_SOURCE_DIR=/path/to/albums.
const SOURCE_DIR = process.env.ALBUMS_SOURCE_DIR || path.join(ROOT, 'public', 'albums');

type SeedAlbum = {
  slug: string;
  title: string;
  description: string;
  dir: string; // public dir holding full/img/thumb/vid
  images: number;
  videos: number;
  imageName: (i: number) => string; // base filename (no ext) for image i
  videoName: (i: number) => string; // base filename (no ext) for video i
};

const ALEX_WU: SeedAlbum = {
  slug: 'alex-wu',
  title: 'Alex Wu Boba',
  description: 'A boba-fuelled collection of photos and clips of Alex Wu.',
  dir: path.join(SOURCE_DIR, 'alex-wu'),
  images: 78,
  videos: 7,
  imageName: (i) => `alexboba${i}`,
  videoName: (i) => `alexbobavid${i}`,
};

async function uploadFile(localPath: string, key: string): Promise<boolean> {
  if (!existsSync(localPath)) {
    console.warn(`  ! missing ${path.relative(ROOT, localPath)} — skipped`);
    return false;
  }
  const body = await readFile(localPath);
  await putObject(key, body, contentTypeForFilename(localPath));
  return true;
}

async function migrate(seed: SeedAlbum, force: boolean): Promise<void> {
  const existing = await prisma.album.findUnique({
    where: { slug: seed.slug },
    select: { id: true, slides: { select: { id: true } } },
  });
  if (existing && existing.slides.length > 0 && !force) {
    console.log(`Album "${seed.slug}" already has ${existing.slides.length} slides — skipping (use --force to add).`);
    return;
  }

  const last = await prisma.album.findFirst({ orderBy: { position: 'desc' }, select: { position: true } });
  const album =
    existing ??
    (await prisma.album.create({
      data: {
        slug: seed.slug,
        title: seed.title,
        description: seed.description,
        position: last ? last.position + 1 : 0,
      },
      select: { id: true, slides: { select: { id: true } } },
    }));

  let position = existing ? existing.slides.length : 0;
  let images = 0;
  let videos = 0;

  for (let i = 1; i <= seed.images; i++) {
    const base = seed.imageName(i);
    const slideId = nanoid();
    const fullKey = albumAssetKey(album.id, `${slideId}-full.jpg`);
    const srcKey = albumAssetKey(album.id, `${slideId}-src.jpg`);
    const thumbKey = albumAssetKey(album.id, `${slideId}-thumb.jpg`);
    const okFull = await uploadFile(path.join(seed.dir, 'full', `${base}.jpg`), fullKey);
    const okSrc = await uploadFile(path.join(seed.dir, 'img', `${base}.jpg`), srcKey);
    const okThumb = await uploadFile(path.join(seed.dir, 'thumb', `${base}.jpg`), thumbKey);
    if (!okSrc || !okThumb) {
      console.warn(`  ! image ${base}: missing src/thumb — skipped`);
      continue;
    }
    await prisma.albumSlide.create({
      data: {
        id: slideId,
        albumId: album.id,
        type: 'image',
        position: position++,
        fullKey: okFull ? fullKey : srcKey,
        srcKey,
        thumbKey,
        alt: `${seed.title} — photo ${i}`,
        download: `${seed.slug}-photo-${i}.jpg`,
      },
    });
    images++;
  }

  for (let i = 1; i <= seed.videos; i++) {
    const base = seed.videoName(i);
    const slideId = nanoid();
    const srcKey = albumAssetKey(album.id, `${slideId}-src.mp4`);
    const thumbKey = albumAssetKey(album.id, `${slideId}-thumb.jpg`);
    const okSrc = await uploadFile(path.join(seed.dir, 'vid', `${base}.mp4`), srcKey);
    const okThumb = await uploadFile(path.join(seed.dir, 'thumb', `${base}.jpg`), thumbKey);
    if (!okSrc || !okThumb) {
      console.warn(`  ! video ${base}: missing file/poster — skipped`);
      continue;
    }
    await prisma.albumSlide.create({
      data: {
        id: slideId,
        albumId: album.id,
        type: 'video',
        position: position++,
        srcKey,
        thumbKey,
        mime: 'video/mp4',
        alt: `${seed.title} — video ${i}`,
        download: `${seed.slug}-video-${i}.mp4`,
      },
    });
    videos++;
  }

  console.log(`Done "${seed.slug}": ${images} images, ${videos} videos → album ${album.id}.`);
}

async function main() {
  if (!s3Configured()) {
    console.warn('WARNING: S3 is not configured — assets will be written to the local .uploads dir, not object storage.');
  }
  const force = process.argv.includes('--force');
  await migrate(ALEX_WU, force);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
