import sharp from 'sharp';
import { LRUCache } from 'lru-cache';

export type ImageFormat = 'webp' | 'avif' | 'jpeg' | 'png';

interface OptimizeOptions {
  /** Max width in pixels */
  width?: number;
  /** Max height in pixels */
  height?: number;
  /** Quality 1-100 (default 80) */
  quality?: number;
  /** Output format (default webp) */
  format?: ImageFormat;
  /** Read & preserve all frames (animated GIF → animated WebP). */
  animated?: boolean;
  /** Apply EXIF orientation so phone photos aren't sideways. */
  autoOrient?: boolean;
  /**
   * Encode exactly the requested `format`, skipping the AVIF suitability gate
   * below. Set this only when the bytes are being STORED under a name that
   * claims the format — a serving path should leave it off so a thumbnail can
   * fall back to WebP.
   */
  forceFormat?: boolean;
}

const FORMAT_CONTENT_TYPES: Record<ImageFormat, string> = {
  webp: 'image/webp',
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/**
 * Below this size on BOTH axes, AVIF stops being a win: its per-tile overhead
 * and 8x8 transform lose to WebP on icons, avatars and the 32px blur
 * placeholders `BlurImage` requests, and each one still costs an AVIF encode
 * (5-20x a WebP encode). `resolveOutputFormat` downgrades those to WebP.
 */
export const AVIF_MIN_DIMENSION = 200;

/**
 * The format an image of `width`x`height` should actually be encoded as when
 * `requested` was negotiated from `Accept`. Only ever downgrades AVIF; every
 * other format is returned untouched.
 */
export function resolveOutputFormat(
  requested: ImageFormat,
  width: number | undefined,
  height: number | undefined,
  animated = false,
): ImageFormat {
  if (requested !== 'avif') return requested;
  // Animated AVIF encodes frame-by-frame and is pathologically slow — an
  // animated GIF re-encode would hold the event loop for seconds.
  if (animated) return 'webp';
  if (width !== undefined && height !== undefined) {
    if (width < AVIF_MIN_DIMENSION && height < AVIF_MIN_DIMENSION) return 'webp';
  }
  return 'avif';
}

/**
 * The pixel size `optimizeImage` will emit for a source of `srcW`x`srcH` under
 * the `fit: 'inside', withoutEnlargement: true` resize it performs. Needed
 * BEFORE encoding so the AVIF gate can look at the output size rather than the
 * source size — a 4000px photo requested at `w=32` is a 32px image.
 */
function projectResize(
  srcW: number,
  srcH: number,
  width?: number,
  height?: number,
): { width: number; height: number } {
  if (!width && !height) return { width: srcW, height: srcH };
  const scale = Math.min(
    width ? width / srcW : Number.POSITIVE_INFINITY,
    height ? height / srcH : Number.POSITIVE_INFINITY,
    1, // withoutEnlargement
  );
  return { width: Math.round(srcW * scale), height: Math.round(srcH * scale) };
}

/**
 * Optimize an image buffer using Sharp.
 * Returns the optimized buffer, its content type, and the encoded pixel
 * dimensions (so callers can reserve layout space and avoid layout shift).
 */
export async function optimizeImage(
  input: Buffer,
  opts: OptimizeOptions = {}
): Promise<{ buffer: Buffer; contentType: string; width: number; height: number }> {
  const {
    width,
    height,
    quality = 80,
    format = 'webp',
    animated = false,
    autoOrient = false,
    forceFormat = false,
  } = opts;

  // Decide AVIF-or-not from the size this will ENCODE at, before building the
  // pipeline. `metadata()` only parses the container header, so this is cheap
  // next to the encode it can save.
  let outFormat = format;
  if (format === 'avif' && !forceFormat) {
    let projected: { width: number; height: number } | undefined;
    try {
      const meta = await sharp(input).metadata();
      const srcW = meta.width;
      const srcH = meta.pageHeight ?? meta.height;
      if (srcW && srcH) projected = projectResize(srcW, srcH, width, height);
    } catch {
      // Unreadable header — let the real pipeline below produce the error.
    }
    outFormat = resolveOutputFormat(format, projected?.width, projected?.height, animated);
  }

  let pipeline = sharp(input, { animated });

  // EXIF auto-orient (not supported alongside multi-frame input).
  if (autoOrient && !animated) pipeline = pipeline.rotate();

  // Resize if dimensions provided (maintains aspect ratio with fit inside)
  if (width || height) {
    pipeline = pipeline.resize(width, height, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // Convert to target format
  switch (outFormat) {
    case 'avif':
      // 4:2:0 + effort 3 is the web-serving configuration (Sharp defaults to
      // 4:4:4 at effort 4, which costs noticeably more CPU and bytes for no
      // visible gain on photographic content). AVIF is the slow encode on this
      // path, so it is the one that has to be tuned.
      pipeline = pipeline.avif({ quality, effort: 3, chromaSubsampling: '4:2:0' });
      break;
    case 'jpeg':
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
      break;
    case 'png':
      pipeline = pipeline.png({ quality });
      break;
    case 'webp':
    default:
      pipeline = pipeline.webp({ quality });
      break;
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  // For animated output Sharp stacks frames vertically, so `info.height` is the
  // whole strip — `pageHeight` is the true per-frame height. Fall back to
  // `info.height` for static images (where `pageHeight` is undefined).
  const outHeight = (info as { pageHeight?: number }).pageHeight ?? info.height;
  return {
    buffer: data,
    // `outFormat`, not `format` — the AVIF gate above may have chosen WebP, and
    // a response that labelled those bytes `image/avif` would fail to decode.
    contentType: FORMAT_CONTENT_TYPES[outFormat],
    width: info.width,
    height: outHeight,
  };
}

/**
 * Read an image's intrinsic pixel dimensions without re-encoding it. Returns
 * `null` if the buffer can't be parsed. Used to tag stored files with their
 * size so the client can reserve layout space up front.
 */
export async function imageDimensions(
  input: Buffer
): Promise<{ width: number; height: number } | null> {
  try {
    const meta = await sharp(input).metadata();
    const width = meta.width;
    const height = meta.pageHeight ?? meta.height;
    if (!width || !height) return null;
    return { width, height };
  } catch {
    return null;
  }
}

/**
 * Parse a supported format string, returning undefined for unsupported values.
 */
export function parseFormat(f: string | null | undefined): ImageFormat | undefined {
  if (!f) return undefined;
  const lower = f.toLowerCase();
  if (lower === 'webp' || lower === 'avif' || lower === 'jpeg' || lower === 'jpg' || lower === 'png') {
    return lower === 'jpg' ? 'jpeg' : lower as ImageFormat;
  }
  return undefined;
}

/**
 * Negotiate the best image format from the Accept header.
 *
 * Callers MUST send `Vary: Accept` on any response whose format came from here
 * — otherwise a shared cache (Cloudflare sits in front of every one of these
 * routes) hands the AVIF it stored for Chrome to a client that cannot decode it.
 */
export function negotiateFormat(accept: string | null): ImageFormat {
  if (!accept) return 'webp';
  if (accept.includes('image/avif')) return 'avif';
  if (accept.includes('image/webp')) return 'webp';
  return 'jpeg';
}

/* ── Origin-side variant cache ──────────────────────────────────────────────
 *
 * One bounded pool shared by every on-demand resize route. Re-encoding per
 * request is the trap AVIF makes expensive: an AVIF encode is 5-20x a WebP one,
 * and `/api/feed/image/*` and `/api/library/cover/*` previously ran sharp on
 * the single web event loop for EVERY request — the browser cache and the CDN
 * hide that from a returning visitor and not at all from a cold cache, a
 * crawler, or the first paint of a shared link.
 *
 * Deliberately one cache rather than one per route: the byte budget is a
 * property of the container, not of the endpoint.
 */

export type CachedImage = { buffer: Uint8Array; contentType: string };

const variantCache = new LRUCache<string, CachedImage>({
  maxSize: 64 * 1024 * 1024, // 64 MB of encoded image bytes
  sizeCalculation: (v) => v.buffer.byteLength + v.contentType.length + 64,
  ttl: 60 * 60_000, // 1 hour
});

/**
 * Cache key for one encoded variant. `source` must identify the bytes (an
 * upstream URL, or a storage key) and is namespaced by `scope` so two routes
 * can't collide on a shared filename.
 */
export function variantCacheKey(
  scope: string,
  source: string,
  opts: { width?: number; height?: number; quality: number; format: ImageFormat },
): string {
  return `${scope}|${source}|w=${opts.width ?? ''}|h=${opts.height ?? ''}|q=${opts.quality}|f=${opts.format}`;
}

export function getCachedVariant(key: string): CachedImage | undefined {
  return variantCache.get(key);
}

export function setCachedVariant(key: string, value: CachedImage): void {
  variantCache.set(key, value);
}
