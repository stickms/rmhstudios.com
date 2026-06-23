/**
 * Incrementally sync the heavy static asset dirs to the public Cloudflare R2
 * bucket that fronts cdn.rmhstudios.com — using the AWS SDK (already a project
 * dependency), so it runs inside the app image with no rclone / host tooling.
 *
 * These assets (book PDFs, game music, 3D models, sprite sheets) used to be
 * served straight off disk by Apache. They now live in R2; the app references
 * them via lib/storage/asset.ts → ${VITE_CDN_BASE_URL}/<path>.
 *
 * Incremental, like `rclone sync`: lists what's already in the bucket, uploads
 * only NEW or CHANGED files (compared by size + MD5/ETag), and deletes objects
 * that were removed from public/. A run with no local changes transfers
 * nothing, so it's cheap to call on every deploy.
 *
 * Reads the same S3_* credentials the app uses (R2 is S3-compatible). Run it
 * via the app image with the host public/ mounted (see deploy.sh), or locally:
 *   set -a; . .env; set +a; PUBLIC_DIR=./public node scripts/sync-static-assets-to-r2.mjs
 */
import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Docker's --env-file passes values literally, INCLUDING surrounding quotes
// (unlike a shell, which strips them). Strip one matching pair so a quoted
// env file (S3_REGION="auto") doesn't yield the literal '"auto"'. Also trim a
// trailing slash + bucket segment some people paste from the R2 "S3 API" field
// — the endpoint must be the bare account host; the SDK appends the bucket.
const clean = (v) =>
  v == null ? v : v.trim().replace(/^(['"])([\s\S]*)\1$/, "$2");

// The R2 dashboard's "S3 API" field includes the bucket (…cloudflarestorage.com
// /rmh-media), but the SDK endpoint must be the bare account host — it appends
// the bucket itself. Normalize to origin so a pasted-with-bucket value works.
let endpoint = clean(process.env.S3_ENDPOINT);
if (endpoint) {
  try {
    endpoint = new URL(endpoint).origin;
  } catch {
    /* malformed — leave as-is so the SDK throws a clear error */
  }
}

const S3_ENDPOINT = endpoint;
const S3_REGION = clean(process.env.S3_REGION) || "auto";
const S3_ACCESS_KEY_ID = clean(process.env.S3_ACCESS_KEY_ID);
const S3_SECRET_ACCESS_KEY = clean(process.env.S3_SECRET_ACCESS_KEY);
const S3_BUCKET = clean(process.env.S3_BUCKET);
const S3_FORCE_PATH_STYLE = clean(process.env.S3_FORCE_PATH_STYLE);

if (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_BUCKET) {
  console.log(
    "[r2-sync] S3_* not fully configured (need S3_ENDPOINT / S3_ACCESS_KEY_ID / " +
      "S3_SECRET_ACCESS_KEY / S3_BUCKET) — skipping static asset sync."
  );
  process.exit(0);
}

// Resolve relative to the mounted public/ dir. The app image deliberately omits
// these heavy dirs, so deploy.sh bind-mounts the host checkout at /app/public.
const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR || "public");

// Dirs that moved off the Apache self-hosted CDN into R2.
const ASSET_DIRS = ["library", "music", "models", "sprites"];

// Long-lived, content-addressed media: cache hard at the edge. Matches the
// Cache-Control the old Apache vhost set for public/.
const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

// How many uploads to run at once (first full sync is large; later runs tiny).
const CONCURRENCY = 12;

const CONTENT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};
const contentType = (file) =>
  CONTENT_TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";

const client = new S3Client({
  endpoint: S3_ENDPOINT,
  region: S3_REGION,
  // R2 uses virtual-hosted-style addressing (set S3_FORCE_PATH_STYLE=false).
  forcePathStyle: S3_FORCE_PATH_STYLE
    ? S3_FORCE_PATH_STYLE !== "false"
    : false,
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  },
});

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // missing dir — nothing to sync
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

/** key (posix, public/-relative) -> { size, etag } for everything under prefix. */
async function listRemote(prefix) {
  const map = new Map();
  let token;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );
    for (const obj of res.Contents || []) {
      map.set(obj.Key, { size: obj.Size, etag: (obj.ETag || "").replace(/"/g, "") });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return map;
}

const md5 = (buf) => createHash("md5").update(buf).digest("hex");

/** Run tasks with a bounded concurrency pool. */
async function pool(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(runners);
}

let uploaded = 0;
let deleted = 0;
let unchanged = 0;

for (const dir of ASSET_DIRS) {
  const root = path.join(PUBLIC_DIR, dir);
  const remote = await listRemote(`${dir}/`);
  const localKeys = new Set();

  // Collect local files first so we know the full key set for this dir.
  const files = [];
  for await (const file of walk(root)) files.push(file);

  await pool(files, CONCURRENCY, async (file) => {
    const key = path.relative(PUBLIC_DIR, file).split(path.sep).join("/");
    localKeys.add(key);
    const body = await readFile(file);
    const existing = remote.get(key);
    if (existing && existing.size === body.length && existing.etag === md5(body)) {
      unchanged++;
      return;
    }
    await client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType(file),
        CacheControl: CACHE_CONTROL,
      })
    );
    uploaded++;
    console.log(`[r2-sync] ↑ ${key}`);
  });

  // Delete objects that no longer exist locally (makes the bucket mirror disk).
  const stale = [...remote.keys()].filter((k) => !localKeys.has(k));
  for (let i = 0; i < stale.length; i += 1000) {
    const batch = stale.slice(i, i + 1000);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: S3_BUCKET,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      })
    );
    deleted += batch.length;
    for (const k of batch) console.log(`[r2-sync] ✗ ${k}`);
  }
}

console.log(
  `[r2-sync] done — uploaded ${uploaded}, deleted ${deleted}, unchanged ${unchanged}.`
);
