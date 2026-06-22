import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
} from "@aws-sdk/client-s3";
import fs from "node:fs/promises";
import path from "node:path";
import { contentTypeForFilename } from "./keys";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function getBucket(): string {
  return requireEnv("S3_BUCKET");
}

/**
 * Whether object storage (S3-compatible) is configured. When it isn't — e.g.
 * local development without S3 — uploads transparently fall back to the local
 * filesystem so features that store files (avatars, feed images, rideshare
 * licences, …) still work. In production, set the S3_* vars to use S3.
 */
function s3Configured(): boolean {
  return Boolean(
    process.env.S3_BUCKET &&
      process.env.S3_ENDPOINT &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY
  );
}

let warnedLocal = false;
function warnLocalOnce(): void {
  if (warnedLocal) return;
  warnedLocal = true;
  console.warn(
    `[storage] S3 is not configured — storing uploads on the local filesystem at ${LOCAL_ROOT}. ` +
      `Set S3_BUCKET / S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY to use object storage.`
  );
}

// ─── Local filesystem backend ──────────────────────────────────────────────
const LOCAL_ROOT = path.resolve(process.env.LOCAL_STORAGE_DIR || ".uploads");

function localPath(key: string): string {
  // Keys look like "rideshare/licenses/abc.jpg"; keep the structure on disk
  // while preventing path traversal.
  const safe = key.replace(/\\/g, "/").replace(/\.\.+/g, "").replace(/^\/+/, "");
  const resolved = path.resolve(LOCAL_ROOT, safe);
  if (resolved !== LOCAL_ROOT && !resolved.startsWith(LOCAL_ROOT + path.sep)) {
    throw new Error("Invalid storage key");
  }
  return resolved;
}

async function localPut(key: string, body: Buffer): Promise<void> {
  warnLocalOnce();
  const file = localPath(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body);
}

async function localGet(
  key: string
): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const body = await fs.readFile(localPath(key));
    return { body, contentType: contentTypeForFilename(key) };
  } catch (err) {
    if ((err as { code?: string })?.code === "ENOENT") return null;
    throw err;
  }
}

async function localDelete(key: string): Promise<void> {
  try {
    await fs.unlink(localPath(key));
  } catch (err) {
    if ((err as { code?: string })?.code !== "ENOENT") throw err;
  }
}

async function localExists(key: string): Promise<boolean> {
  try {
    await fs.stat(localPath(key));
    return true;
  } catch {
    return false;
  }
}

// ─── S3 backend ──────────────────────────────────────────────────────────────
/**
 * The R2 dashboard's "S3 API" value includes the bucket
 * (…cloudflarestorage.com/rmh-media), but the SDK endpoint must be the bare
 * account host — it appends the bucket itself. Normalize to the origin so a
 * pasted-with-bucket value still works.
 */
function getEndpoint(): string {
  const raw = requireEnv("S3_ENDPOINT");
  try {
    return new URL(raw).origin;
  } catch {
    return raw; // malformed — let the SDK surface a clear error
  }
}

let client: S3Client | null = null;
function getClient(): S3Client {
  if (client) return client;
  client = new S3Client({
    endpoint: getEndpoint(),
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: {
      accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    },
  });
  return client;
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  if (!s3Configured()) return localPut(key, body);
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function getObject(
  key: string
): Promise<{ body: Buffer; contentType: string } | null> {
  if (!s3Configured()) return localGet(key);
  try {
    const res = await getClient().send(
      new GetObjectCommand({ Bucket: getBucket(), Key: key })
    );
    const bytes = await (res.Body as {
      transformToByteArray: () => Promise<Uint8Array>;
    }).transformToByteArray();
    return {
      body: Buffer.from(bytes),
      contentType: res.ContentType || "application/octet-stream",
    };
  } catch (err) {
    if (err instanceof NoSuchKey || (err as { name?: string })?.name === "NoSuchKey") {
      return null;
    }
    throw err;
  }
}

export async function deleteObject(key: string): Promise<void> {
  if (!s3Configured()) return localDelete(key);
  await getClient().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key })
  );
}

export async function objectExists(key: string): Promise<boolean> {
  if (!s3Configured()) return localExists(key);
  try {
    await getClient().send(
      new HeadObjectCommand({ Bucket: getBucket(), Key: key })
    );
    return true;
  } catch {
    return false;
  }
}

export { getBucket };
