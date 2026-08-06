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
import { brotliDecompressSync } from "node:zlib";
import { contentTypeForFilename } from "./keys";
import { compressForStorage } from "./compress.server";

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
export function s3Configured(): boolean {
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

/**
 * Write an object to storage.
 *
 * Every body goes through {@link compressForStorage} first, so "compress what
 * we upload" is a property of the storage layer rather than a rule each of the
 * ~20 call sites has to remember. That pass is lossless, format-preserving and
 * never returns something larger than it was given, so it is safe here where it
 * would not be safe to apply per-caller. See `lib/storage/compress.server.ts`
 * for what it will and won't touch.
 *
 * An explicit `contentEncoding` means the caller has already compressed the
 * body itself; that path is passed straight through untouched, because
 * double-encoding would produce an object no browser can read.
 */
export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
  contentEncoding?: string
): Promise<void> {
  let out = body;
  let encoding = contentEncoding;

  if (!contentEncoding) {
    const compressed = await compressForStorage(body, contentType);
    out = compressed.body;
    encoding = compressed.contentEncoding;
  }

  // The local FS backend can't persist metadata; readers fall back to sniffing.
  // Brotli'd bodies would therefore be unreadable on disk, so the local path
  // stores what it was handed.
  if (!s3Configured()) return localPut(key, encoding === "br" ? body : out);

  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: out,
      ContentType: contentType,
      ...(encoding ? { ContentEncoding: encoding } : {}),
    })
  );
}

/**
 * Read an object, **decoded**.
 *
 * `putObject` Brotli-compresses text-shaped bodies (SVG, JSON, XML, plain text)
 * and records `ContentEncoding: br` on the object. Reading one back therefore
 * yields compressed bytes, and a caller that hands those to a `Response`
 * without the matching `Content-Encoding` header serves a broken file — an SVG
 * that renders as nothing, a JSON body that will not parse. Worse, a caller
 * that feeds them to `sharp` (the album asset route resizes on demand) throws
 * on input it cannot identify.
 *
 * Every one of the call sites did exactly that: not one forwarded the header.
 * So the encoding is undone here rather than being a rule each route has to
 * remember, on the same principle as compressing inside `putObject` — the
 * storage layer's compression should be invisible to everyone above it.
 *
 * That trades a little egress: forwarding `br` to a browser that accepts it
 * would be smaller on the wire than re-sending the decoded bytes. Nothing was
 * collecting that saving anyway (no route sent the header), and
 * correct-by-default is the right way round for a function whose failure mode
 * is silent corruption. {@link getObjectEncoded} is there for a route that
 * wants to opt back in deliberately.
 */
export async function getObject(
  key: string
): Promise<{ body: Buffer; contentType: string } | null> {
  const stored = await getObjectEncoded(key);
  if (!stored) return null;
  if (stored.contentEncoding !== "br") {
    return { body: stored.body, contentType: stored.contentType };
  }
  try {
    return { body: brotliDecompressSync(stored.body), contentType: stored.contentType };
  } catch {
    // An object labelled `br` that will not inflate is corrupt either way;
    // returning the raw bytes at least lets a caller see something.
    return { body: stored.body, contentType: stored.contentType };
  }
}

/**
 * Read an object exactly as stored, including its `contentEncoding`.
 *
 * For a caller that will forward `Content-Encoding` to the client and wants the
 * wire saving. If you are not setting that header, use {@link getObject}.
 */
export async function getObjectEncoded(
  key: string
): Promise<{ body: Buffer; contentType: string; contentEncoding?: string } | null> {
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
      contentEncoding: res.ContentEncoding,
    };
  } catch (err) {
    if (err instanceof NoSuchKey || (err as { name?: string })?.name === "NoSuchKey") {
      return null;
    }
    throw err;
  }
}

export interface ObjectRange {
  body: Buffer;
  contentType: string;
  /** Byte offset of the first byte returned. */
  start: number;
  /** Byte offset of the last byte returned, inclusive. */
  end: number;
  /** Size of the whole object, from `Content-Range`. */
  total: number;
}

/**
 * Read a byte range of an object.
 *
 * The alternative — fetch the whole object and slice it — is what the audio
 * stream route was doing, and it costs a full object GET plus the whole file
 * resident in memory for every request, including a `Range: bytes=0-1`. That is
 * an egress and memory amplifier: the response is two bytes and the work behind
 * it is fifty megabytes, repeatable as fast as a caller can ask.
 *
 * Returns null if the object is missing, if the range is unsatisfiable, or if
 * the object is Brotli-encoded — a range of compressed bytes is meaningless to
 * a caller that asked for a range of the file, so those fall back to
 * {@link getObject}, which decodes.
 */
export async function getObjectRange(
  key: string,
  start: number,
  end: number
): Promise<ObjectRange | null> {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
    return null;
  }

  if (!s3Configured()) {
    const stored = await localGet(key);
    if (!stored) return null;
    const total = stored.body.length;
    if (start >= total) return null;
    const last = Math.min(end, total - 1);
    return {
      body: stored.body.subarray(start, last + 1),
      contentType: stored.contentType,
      start,
      end: last,
      total,
    };
  }

  try {
    const res = await getClient().send(
      new GetObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Range: `bytes=${start}-${end}`,
      })
    );
    if (res.ContentEncoding === "br") return null;

    const bytes = await (res.Body as {
      transformToByteArray: () => Promise<Uint8Array>;
    }).transformToByteArray();

    // `Content-Range: bytes <start>-<end>/<total>` is the authority on what the
    // store actually returned — it clamps an over-long end for us.
    const parsed = /bytes (\d+)-(\d+)\/(\d+)/.exec(res.ContentRange ?? "");
    const body = Buffer.from(bytes);
    return {
      body,
      contentType: res.ContentType || contentTypeForFilename(key),
      start: parsed ? Number(parsed[1]) : start,
      end: parsed ? Number(parsed[2]) : start + body.length - 1,
      total: parsed ? Number(parsed[3]) : body.length,
    };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (err instanceof NoSuchKey || name === "NoSuchKey") return null;
    // 416 from the store — the caller asked past the end of the object.
    if (name === "InvalidRange") return null;
    throw err;
  }
}

/** Size of an object without transferring it. Null when it does not exist. */
export async function getObjectSize(key: string): Promise<number | null> {
  if (!s3Configured()) {
    const stored = await localGet(key);
    return stored ? stored.body.length : null;
  }
  try {
    const res = await getClient().send(
      new HeadObjectCommand({ Bucket: getBucket(), Key: key })
    );
    return typeof res.ContentLength === "number" ? res.ContentLength : null;
  } catch {
    return null;
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
