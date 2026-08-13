/**
 * Pictures on an Open Graph card.
 *
 * Until this module the cards were type-only: a post with four photos unfurled
 * as the words "4 photos", and a game hub unfurled without the key art that is
 * the first thing anyone recognises it by. The reason was not design — it was
 * that satori takes an `<img src>` and nothing here knew how to turn "a feed
 * image URL", "a `public/` asset path" or "a Discord avatar" into bytes it
 * could hand over.
 *
 * So this file is the one place that answers that, for all three:
 *
 * 1. **Stored objects** — a feed image (`/api/feed/image/x.png`, or the CDN URL
 *    for the same object) and an uploaded avatar are read straight out of
 *    object storage with `getObject`. No HTTP at all: the card route already
 *    runs in the process that serves those bytes, so going out to the CDN to
 *    fetch our own object would add a round trip, a failure mode, and a hard
 *    dependency on `VITE_CDN_BASE_URL` being set — which is why avatars never
 *    appeared on a card in development, where the stored URL is the local proxy
 *    path and `safeFetch` (https-only, absolute-only) rejected it outright.
 * 2. **`public/` assets** — game and app key art, addressed by the same
 *    site-relative path the catalog already stores. Read from disk, from the
 *    same candidate roots the vibe bundler uses, because the deployed layout is
 *    `.output/public` rather than `public`.
 * 3. **Anything else** — a GIF from Tenor, an OAuth avatar — is a user-supplied
 *    URL and goes through `safeFetch`, with a byte cap on top of its timeout.
 *
 * Everything then goes through **sharp**, and this is the part that is not
 * optional: the bytes are re-encoded to the exact pixel box the card will draw
 * them in. satori has no layout feedback and resvg decodes whatever it is
 * given, so handing a 2048px 4 MB source into a 200px tile would base64 four
 * megabytes into the SVG and rasterise it at full size before scaling it back
 * down — per image, per render. Cropping first also means the card can rely on
 * the dimensions it asked for instead of hoping `objectFit` behaves.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { LRUCache } from 'lru-cache';
import { getObject } from '@/lib/storage/s3.server';
import {
  feedImageFilename,
  feedImageKey,
  userAvatarFilename,
  userAvatarKey,
} from '@/lib/storage/keys';
import { safeFetch } from '@/lib/ssrf-guard.server';

/** A picture ready for satori: a `data:` URI at exactly the size it will draw. */
export interface OgImage {
  src: string;
  width: number;
  height: number;
}

export interface ImageBox {
  width: number;
  height: number;
}

export interface LoadOgImageOptions extends ImageBox {
  /**
   * `cover` fills the box, cropping to sharp's attention strategy (the same
   * "keep the interesting part" crop a feed thumbnail gets). `contain` fits
   * inside the box without enlarging, so the returned size may be smaller —
   * always lay out against the returned `width`/`height`, never the requested
   * box.
   */
  fit?: 'cover' | 'contain';
  /** Keep transparency (avatars, logos) instead of flattening onto card white. */
  alpha?: boolean;
}

/** Ceiling on a fetched/read source. A card is never worth more than this. */
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const REMOTE_TIMEOUT_MS = 3_500;

/**
 * Decoded sources, capped by BYTES rather than entries — the whole point of the
 * cap is memory, and one 4 MB screenshot is not the same cost as one 40 KB
 * avatar. Short-lived: the rendered PNG caches in the card renderers are what
 * absorb repeat traffic, and this only has to cover the images of one card
 * being re-rendered a few times in a row.
 */
const sourceCache = new LRUCache<string, Buffer>({
  maxSize: 24 * 1024 * 1024,
  sizeCalculation: (buf) => buf.byteLength || 1,
  ttl: 5 * 60 * 1000,
});

/** Encoded results, for the single-image callers (key art, avatars). */
const encodedCache = new LRUCache<string, OgImage>({ max: 120, ttl: 10 * 60 * 1000 });

/**
 * Sources that failed. Without this a post whose attachment was swept from
 * storage re-attempts every read on every render of a card that is about to
 * fail the same way.
 */
const failedSources = new LRUCache<string, true>({ max: 300, ttl: 60 * 1000 });

/** Where a `public/`-relative asset may live, dev checkout and build output. */
const PUBLIC_ROOTS = ['public', path.join('.output', 'public'), path.join('dist', 'public')];

async function readStoredObject(key: string): Promise<Buffer | null> {
  try {
    const object = await getObject(key);
    return object?.body ?? null;
  } catch {
    return null;
  }
}

/**
 * Read a `public/`-relative asset off disk.
 *
 * The containment check is not decorative: these paths come from the catalog
 * today, but "a site-relative path" is the shape a route will eventually pass
 * from a database column, and `path.resolve` happily walks out of the root.
 */
async function readPublicAsset(assetPath: string): Promise<Buffer | null> {
  const clean = assetPath.split(/[?#]/)[0];
  for (const rootName of PUBLIC_ROOTS) {
    const root = path.resolve(process.cwd(), rootName);
    const file = path.resolve(root, `.${clean}`);
    if (file !== root && !file.startsWith(root + path.sep)) continue;
    try {
      const buf = await readFile(file);
      if (buf.byteLength > MAX_SOURCE_BYTES) return null;
      return buf;
    } catch {
      // Try the next root — the dev checkout and the Nitro output disagree.
    }
  }
  return null;
}

async function readRemote(url: string): Promise<Buffer | null> {
  try {
    const res = await safeFetch(url, { timeoutMs: REMOTE_TIMEOUT_MS });
    if (!res.ok) return null;
    // Trust the header when it is present (cheap rejection), and check the
    // real length afterwards regardless (a lying or absent header is normal).
    const declared = Number(res.headers.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > MAX_SOURCE_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.byteLength > MAX_SOURCE_BYTES ? null : buf;
  } catch {
    return null;
  }
}

/**
 * Resolve any of the site's image references to bytes.
 *
 * Order matters: the storage forms are checked first because a feed image's CDN
 * URL is *also* a valid https URL, and fetching it over the network would be
 * the slower, more fragile way to read an object this process can open.
 */
export async function readImageSource(source: string | null | undefined): Promise<Buffer | null> {
  if (!source) return null;
  const cached = sourceCache.get(source);
  if (cached) return cached;
  if (failedSources.has(source)) return null;

  let bytes: Buffer | null = null;
  const feed = feedImageFilename(source);
  const avatar = feed ? null : userAvatarFilename(source);
  if (feed) bytes = await readStoredObject(feedImageKey(feed));
  else if (avatar) bytes = await readStoredObject(userAvatarKey(avatar));
  else if (source.startsWith('/')) bytes = await readPublicAsset(source);
  else if (/^https?:\/\//i.test(source)) bytes = await readRemote(source);

  if (!bytes?.byteLength) {
    failedSources.set(source, true);
    return null;
  }
  sourceCache.set(source, bytes);
  return bytes;
}

/**
 * Re-encode bytes into the exact box a card will draw them in.
 *
 * `animated: false` is implicit and deliberate — a GIF contributes its first
 * frame, which is the only frame a still card can show. `failOn: 'none'` keeps
 * a slightly-truncated upload (common enough in user media) rendering instead
 * of taking the whole card down with it.
 */
export async function encodeOgImage(
  bytes: Buffer,
  { width, height, fit = 'cover', alpha = false }: LoadOgImageOptions,
): Promise<OgImage | null> {
  try {
    const pipeline = sharp(bytes, { failOn: 'none' })
      // EXIF orientation: phone photos are stored rotated, and a card that
      // ignores the tag shows them on their side.
      .rotate()
      .resize(width, height, {
        fit: fit === 'cover' ? 'cover' : 'inside',
        withoutEnlargement: fit === 'contain',
        // Sharp's saliency crop, so a 4:3 photo cropped to a square tile keeps
        // its subject rather than its top-left corner.
        ...(fit === 'cover' ? { position: 'attention' as const } : {}),
      });

    const encoded = alpha
      ? pipeline.png({ compressionLevel: 9 })
      : // Flattened onto the card's canvas white, because the pane it lands on
        // is white glass — a transparent PNG left unflattened turns black in
        // resvg's JPEG path.
        pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true });

    const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
    if (!info.width || !info.height) return null;
    return {
      src: `data:image/${alpha ? 'png' : 'jpeg'};base64,${data.toString('base64')}`,
      width: info.width,
      height: info.height,
    };
  } catch {
    return null;
  }
}

/** Read + encode in one call, memoised on the source and the box. */
export async function loadOgImage(
  source: string | null | undefined,
  opts: LoadOgImageOptions,
): Promise<OgImage | null> {
  if (!source) return null;
  const key = `${source}|${opts.width}x${opts.height}|${opts.fit ?? 'cover'}|${opts.alpha ? 'a' : ''}`;
  const hit = encodedCache.get(key);
  if (hit) return hit;

  const bytes = await readImageSource(source);
  if (!bytes) return null;
  const image = await encodeOgImage(bytes, opts);
  if (image) encodedCache.set(key, image);
  return image;
}

/**
 * Read several sources at once, keeping only the ones that resolved.
 *
 * Returns the bytes rather than encoded images because a collage's tile sizes
 * depend on how many images actually loaded — a post with four attachments of
 * which one has been swept lays out as three, and that cannot be known until
 * every read has come back.
 */
export async function readImageSources(sources: readonly string[]): Promise<Buffer[]> {
  const buffers = await Promise.all(sources.map((s) => readImageSource(s)));
  return buffers.filter((b): b is Buffer => b !== null);
}
