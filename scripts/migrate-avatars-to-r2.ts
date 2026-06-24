/**
 * One-time backfill: move existing user profile avatars off the local disk
 * (db/avatars/<file>) into object storage (R2, under user-avatars/<file>) and
 * rewrite UserProfile.customImage to the CDN/proxy URL.
 *
 * Idempotent and re-runnable: profiles whose customImage is already in the new
 * form (or whose object already exists in storage) are skipped.
 *
 * SELF-CONTAINED ON PURPOSE: the production runner image ships prod deps + the
 * scripts/ dir but NOT lib/, and `import.meta.env` is empty outside the Vite
 * build — so this script depends only on packages (@prisma/client,
 * @prisma/adapter-pg, @aws-sdk/client-s3) + process.env, never on @/lib. That
 * lets the deploy run it with `node scripts/migrate-avatars-to-r2.ts` inside the
 * freshly-built image (see deploy.sh), exactly like generate-library-metadata.ts.
 *
 * Run locally:  pnpm exec tsx scripts/migrate-avatars-to-r2.ts
 * Run on host:  see deploy.sh "Backfill avatars to R2" step.
 */

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

// ── Storage (mirrors lib/storage/s3.server.ts + keys.ts, inlined) ────────────
const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_ENDPOINT = process.env.S3_ENDPOINT || '';
const CDN_BASE = (process.env.VITE_CDN_BASE_URL || '').replace(/\/+$/, '');

function s3Configured(): boolean {
  return Boolean(
    S3_BUCKET &&
      S3_ENDPOINT &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY,
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

const userAvatarKey = (f: string) => `user-avatars/${f}`;
const userAvatarUrl = (f: string) =>
  CDN_BASE ? `${CDN_BASE}/${userAvatarKey(f)}` : `/api/profile/avatar/${f}`;

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};
const contentTypeFor = (f: string) =>
  CONTENT_TYPES[path.extname(f).toLowerCase()] ?? 'application/octet-stream';

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

// ── Prisma (mirrors lib/prisma.server.ts, inlined) ───────────────────────────
function prismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

// Honor STORAGE_PATH (the bind-mounted db/ volume, e.g. /mnt/rmh/db on the VPS),
// same as docker-compose; fall back to ./db for local dev.
const DB_ROOT = process.env.STORAGE_PATH || path.join(process.cwd(), 'db');
const AVATAR_DIR = path.join(DB_ROOT, 'avatars');

/** Filename from a legacy local-proxy avatar URL ("/api/profile/avatar/<f>"). */
function localAvatarFilename(url: string): string | null {
  const prefix = '/api/profile/avatar/';
  if (!url.startsWith(prefix)) return null;
  const f = url.slice(prefix.length);
  return /^[A-Za-z0-9._-]+$/.test(f) ? f : null;
}

async function main() {
  if (!s3Configured()) {
    console.error(
      'Refusing to run: object storage (S3_*) is not configured. This migration ' +
        'would have nowhere to upload to.',
    );
    process.exitCode = 1;
    return;
  }

  const prisma = prismaClient();
  try {
    // Only profiles still pointing at the local proxy path need migrating.
    const profiles = await prisma.userProfile.findMany({
      where: { customImage: { startsWith: '/api/profile/avatar/' } },
      select: { userId: true, customImage: true },
    });

    if (profiles.length === 0) {
      console.log('No locally-stored avatars left to migrate. Nothing to do.');
      return;
    }

    console.log(
      `Migrating ${profiles.length} avatar(s) to object storage` +
        (CDN_BASE ? ` (URLs → ${CDN_BASE}/user-avatars/…)` : '') +
        '…',
    );
    let moved = 0;
    let rewritten = 0;
    let missing = 0;

    for (const profile of profiles) {
      const filename = localAvatarFilename(profile.customImage ?? '');
      if (!filename) {
        console.warn(`  skip ${profile.userId}: unrecognized customImage`);
        continue;
      }
      const key = userAvatarKey(filename);

      if (!(await objectExists(key))) {
        try {
          const bytes = await readFile(path.join(AVATAR_DIR, filename));
          await putObject(key, bytes, contentTypeFor(filename));
          moved++;
        } catch (err) {
          if ((err as { code?: string })?.code === 'ENOENT') {
            missing++;
            console.warn(`  ${profile.userId}: local file missing for ${filename}`);
          } else {
            throw err;
          }
        }
      }

      const newUrl = userAvatarUrl(filename);
      if (newUrl !== profile.customImage) {
        await prisma.userProfile.update({
          where: { userId: profile.userId },
          data: { customImage: newUrl },
        });
        rewritten++;
      }
    }

    console.log(
      `\nFinished: ${moved} uploaded, ${rewritten} URLs rewritten, ${missing} missing local file(s).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
