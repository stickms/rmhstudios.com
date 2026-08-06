/**
 * One-time backfill: move the last local-disk media into object storage (R2).
 *
 * Three things were still being written to the web container's own filesystem
 * long after everything else moved to R2:
 *
 *   - Slice It song audio      `db/music/<file>`         → `slice-it/audio/<file>`
 *   - Slice It cover art       `db/music/covers/<file>`  → `slice-it/covers/<file>`
 *   - Curated build thumbnails `db/builds/<file>`        → `curated-builds/<file>`
 *
 * That is a real bug and not just untidiness: production runs **blue/green** web
 * containers (`deploy/hotswap-web.sh` flips 7005/7015), so a file uploaded to
 * blue was invisible to green. Half the song library would 404 after a deploy
 * and come back after the next one.
 *
 * The upload routes now write to storage directly; this moves what was written
 * before them. Both read paths fall back to the local disk, so running this is
 * safe at any time and skipping it only means the old files keep being served
 * from wherever they happen to live.
 *
 * Idempotent and re-runnable: a file already in storage is skipped, and rows
 * already pointing at an object key are never re-examined.
 *
 * SELF-CONTAINED ON PURPOSE: the production runner image ships prod deps + the
 * `scripts/` dir but NOT `lib/`, so this depends only on packages
 * (`@prisma/client`, `@prisma/adapter-pg`, `@aws-sdk/client-s3`) and
 * `process.env` — never on `@/lib`. Same rule as
 * `scripts/migrate-avatars-to-r2.ts`, and the same reason.
 *
 * Run locally:  pnpm media:migrate
 * Run on host:  see deploy.sh "Backfill local media to R2".
 */

import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

// ── Storage (mirrors lib/storage/s3.server.ts + keys.ts, inlined) ────────────

const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_ENDPOINT = process.env.S3_ENDPOINT || '';

function s3Configured(): boolean {
  return Boolean(
    S3_BUCKET && S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY,
  );
}

let s3: S3Client | null = null;
function client(): S3Client {
  if (s3) return s3;
  s3 = new S3Client({
    endpoint: (() => {
      try {
        return new URL(S3_ENDPOINT).origin;
      } catch {
        return S3_ENDPOINT;
      }
    })(),
    region: process.env.S3_REGION || 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    },
  });
  return s3;
}

const SONG_AUDIO_PREFIX = 'slice-it/audio/';
const SONG_COVER_PREFIX = 'slice-it/covers/';
const CURATED_BUILD_PREFIX = 'curated-builds/';

const CONTENT_TYPES: Record<string, string> = {
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.webm': 'audio/webm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};
const contentTypeFor = (name: string) =>
  CONTENT_TYPES[path.extname(name).toLowerCase()] ?? 'application/octet-stream';

async function objectExists(key: string): Promise<boolean> {
  try {
    await client().send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await client().send(
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
}

/**
 * No compression pass here, deliberately.
 *
 * `lib/storage/compress.server.ts` runs inside `putObject` for live uploads, but
 * everything this script moves is already in its final encoded form — audio is
 * AAC (the compressor skips `audio/*` outright) and covers are WebP that the
 * upload route already re-encoded at quality 82. Re-encoding them here would
 * cost CPU on a deploy for a fraction of a percent, and pulling `sharp` in would
 * break the "packages only, no lib/" rule the runner image depends on.
 */

// ── Prisma (mirrors lib/prisma.server.ts, inlined) ───────────────────────────

function prismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Honour STORAGE_PATH (the bind-mounted db/ volume, e.g. /mnt/rmh/db on the
// VPS), same as docker-compose; fall back to ./db for local dev.
const DB_ROOT = process.env.STORAGE_PATH || path.join(process.cwd(), 'db');

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

/** Read a file from under `dir`, refusing anything that could escape it. */
async function readLocal(dir: string, name: string): Promise<Buffer | null> {
  if (!SAFE_NAME.test(name)) return null;
  const root = path.resolve(dir);
  const resolved = path.resolve(root, name);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  try {
    return await readFile(resolved);
  } catch {
    return null;
  }
}

interface Tally {
  moved: number;
  skipped: number;
  missing: number;
}

function summarise(label: string, tally: Tally): void {
  console.log(
    `  ${label}: ${tally.moved} moved, ${tally.skipped} already in storage, ` +
      `${tally.missing} not found on disk`,
  );
}

// ── Slice It songs ───────────────────────────────────────────────────────────

/**
 * `Song.audioUrl` holds a bare filename on legacy rows and an object key on new
 * ones; `Song.coverUrl` holds the old proxy URL or an object key. Both are
 * rewritten to keys, which is what flips the read path off the disk fallback.
 */
async function migrateSongs(prisma: PrismaClient): Promise<void> {
  const songs = await prisma.song.findMany({
    select: { id: true, audioUrl: true, coverUrl: true },
  });

  const audio: Tally = { moved: 0, skipped: 0, missing: 0 };
  const covers: Tally = { moved: 0, skipped: 0, missing: 0 };
  const musicDir = path.join(DB_ROOT, 'music');
  const coverDir = path.join(musicDir, 'covers');

  for (const song of songs) {
    const update: { audioUrl?: string; coverUrl?: string } = {};

    if (song.audioUrl && !song.audioUrl.startsWith(SONG_AUDIO_PREFIX)) {
      const key = `${SONG_AUDIO_PREFIX}${song.audioUrl}`;
      if (await objectExists(key)) {
        update.audioUrl = key;
        audio.skipped++;
      } else {
        const body = await readLocal(musicDir, song.audioUrl);
        if (body) {
          await putObject(key, body, contentTypeFor(song.audioUrl));
          update.audioUrl = key;
          audio.moved++;
        } else {
          // The row outlived its file. Leave the value alone rather than
          // pointing it at an object that does not exist — the read path
          // already 404s cleanly and an admin can see which song is broken.
          audio.missing++;
        }
      }
    }

    const legacyCoverPrefix = '/api/slice-it/songs/cover/';
    if (song.coverUrl?.startsWith(legacyCoverPrefix)) {
      const name = song.coverUrl.slice(legacyCoverPrefix.length);
      const key = `${SONG_COVER_PREFIX}${name}`;
      if (await objectExists(key)) {
        update.coverUrl = key;
        covers.skipped++;
      } else {
        const body = await readLocal(coverDir, name);
        if (body) {
          await putObject(key, body, contentTypeFor(name));
          update.coverUrl = key;
          covers.moved++;
        } else {
          covers.missing++;
        }
      }
    }

    if (Object.keys(update).length > 0) {
      await prisma.song.update({ where: { id: song.id }, data: update });
    }
  }

  summarise('song audio', audio);
  summarise('song covers', covers);
}

// ── Curated build thumbnails ─────────────────────────────────────────────────

/**
 * No database update needed: the serving route looks the filename up in storage
 * first and falls back to disk, so uploading under the same name is enough. The
 * URL stored on the build row keeps working either way.
 */
async function migrateCuratedBuilds(): Promise<void> {
  const dir = path.join(DB_ROOT, 'builds');
  const tally: Tally = { moved: 0, skipped: 0, missing: 0 };

  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    console.log('  curated build images: no db/builds directory — nothing to move');
    return;
  }

  for (const name of names) {
    if (!SAFE_NAME.test(name)) continue;
    const key = `${CURATED_BUILD_PREFIX}${name}`;
    if (await objectExists(key)) {
      tally.skipped++;
      continue;
    }
    const body = await readLocal(dir, name);
    if (!body) {
      tally.missing++;
      continue;
    }
    await putObject(key, body, contentTypeFor(name));
    tally.moved++;
  }

  summarise('curated build images', tally);
}

// ── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!s3Configured()) {
    console.error(
      'Refusing to run: object storage (S3_*) is not configured. This migration ' +
        'would have nowhere to upload to.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Migrating local media to R2 (source: ${DB_ROOT})`);
  const prisma = prismaClient();
  try {
    await migrateSongs(prisma);
    await migrateCuratedBuilds();
    console.log('Done. db/music and db/builds can be reclaimed once verified.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Media migration failed:', error);
  process.exitCode = 1;
});
