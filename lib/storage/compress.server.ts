/**
 * Lossless compression for everything on its way into object storage.
 *
 * Every byte we put in R2 is paid for twice — once in storage and once on every
 * egress — and most of what we upload arrives from a browser encoder that
 * optimised for speed, not size. This module sits in front of `putObject` and
 * squeezes what it safely can.
 *
 * ## The two rules
 *
 * **1. Losslessly, always.** Nothing here may change a single decoded pixel or
 * byte. That constrains the toolbox more than it first appears:
 *
 *   - PNG → re-deflate at maximum effort. Pixels are untouched; only the
 *     compressed stream changes.
 *   - WebP → re-encode with `lossless: true` at maximum effort. Note that a
 *     *lossy* WebP re-encoded "losslessly" preserves its already-lossy pixels
 *     exactly, which is what lossless means here: we never lose anything we
 *     were given.
 *   - JPEG → **strip metadata only.** There is no lossless JPEG re-compressor
 *     in `sharp`; `mozjpeg` re-encodes and that is generative loss. Dropping
 *     EXIF/ICC changes no pixels, often saves tens of kilobytes, and removes
 *     the GPS coordinates a phone camera helpfully embedded — a privacy win
 *     that pays for the whole module on its own.
 *   - GIF / animated anything → left alone. Re-encoding animation risks frame
 *     timing and palette drift for a small win.
 *   - Text-shaped payloads (JSON, SVG, plain text) → Brotli at maximum quality,
 *     served back with `Content-Encoding: br`. Perfectly reversible.
 *   - Already-compressed media (audio, video, zip) → left alone. Brotli over an
 *     Opus stream costs CPU and returns nothing.
 *
 * **2. Never bigger.** Every path compares against the original and keeps the
 * original if the "optimised" version is larger, which happens more often than
 * you would think — small PNGs and short JSON blobs both routinely lose to
 * their input. The function is therefore safe to apply blindly.
 *
 * ## The format-preserving rule
 *
 * Compression never changes an object's format. Converting a PNG to lossless
 * WebP would usually be smaller, but keys carry file extensions
 * (`lib/storage/keys.ts`), URLs are stored on rows that are already written,
 * and a `.png` key serving `image/webp` is a bug waiting for the one client
 * that sniffs by extension. Format conversion belongs to the delivery layer
 * (`lib/image-optimize.ts`, which negotiates per request), not to storage.
 *
 * Voice notes are the one deliberate exception to "lossless", and they are not
 * handled here: they arrive already Opus-encoded by the browser, so the
 * lossy step happens client-side before upload and this module leaves them be.
 * Their size ceiling lives in `lib/media/voice-policy.ts`.
 */

import sharp from 'sharp';
import { brotliCompress, constants as zlibConstants } from 'node:zlib';
import { promisify } from 'node:util';

const brotli = promisify(brotliCompress);

export interface CompressedPayload {
  body: Buffer;
  /** Unchanged from the input — this module never converts formats. */
  contentType: string;
  /** Set to 'br' when the body was Brotli'd; must reach the PutObject call. */
  contentEncoding?: string;
}

/** Content types worth running Brotli over. */
const TEXT_LIKE = /^(text\/|application\/(json|xml|javascript|x-ndjson)|image\/svg\+xml)/;

/** Already-compressed containers. Re-compressing these is pure CPU burn. */
const INCOMPRESSIBLE =
  /^(audio\/|video\/|image\/(gif|avif|jxl)|application\/(zip|gzip|x-brotli|octet-stream|pdf))/;

/**
 * Brotli's window/quality ceiling. Quality 11 is slow on large inputs, so the
 * cap keeps a pathological upload from occupying a worker: above it we drop to
 * a still-strong quality 9.
 */
const BROTLI_SLOW_PATH_LIMIT = 4 * 1024 * 1024;

/** Skip work entirely below this — the framing overhead dominates. */
const MIN_WORTH_COMPRESSING = 512;

async function compressPng(input: Buffer): Promise<Buffer> {
  // `compressionLevel: 9` is zlib at maximum and `adaptiveFiltering` picks the
  // best PNG filter per scanline — both rearrange the compressed stream without
  // touching a pixel.
  //
  // `palette: true` is deliberately NOT set. It looks like a free win and is
  // not: sharp quantises to a 256-colour palette unconditionally, so a
  // photographic PNG comes back visibly banded. An earlier draft of this file
  // set it, believing sharp fell back for images with more colours; the
  // pixel-equality test in `storage-compression.test.ts` caught it. It also
  // made a 128×128 PNG take 108 seconds at `effort: 10`.
  //
  // `effort` is left at sharp's default (7). Level 10 costs several times the
  // CPU for a fraction of a percent, and this runs on the request path.
  return sharp(input)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function compressWebp(input: Buffer): Promise<Buffer> {
  return sharp(input).webp({ lossless: true, effort: 6 }).toBuffer();
}

async function stripJpegMetadata(input: Buffer): Promise<Buffer> {
  // `sharp` re-encodes JPEG on `.toBuffer()`, which would be lossy — so this is
  // deliberately NOT a sharp call. `rotate()` + `keepMetadata()` would also
  // re-encode. Instead walk the JFIF segment list and drop APPn/COM segments,
  // which leaves every entropy-coded scan byte exactly as it arrived.
  return stripJpegAppSegments(input);
}

/**
 * Remove APP1..APP15 (EXIF, XMP, Photoshop) and COM segments from a JPEG.
 * APP0/JFIF is kept — some decoders want it for pixel density.
 *
 * Returns the input unchanged if anything about the structure is unexpected;
 * a surprising JPEG is not worth risking for a few kilobytes.
 */
export function stripJpegAppSegments(input: Buffer): Buffer {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return input;

  const out: Buffer[] = [input.subarray(0, 2)]; // SOI
  let i = 2;

  while (i < input.length) {
    // Every marker starts 0xFF; padding fill bytes are legal before it.
    if (input[i] !== 0xff) return input;
    let markerStart = i;
    while (markerStart < input.length && input[markerStart] === 0xff) markerStart++;
    if (markerStart >= input.length) return input;
    const marker = input[markerStart];

    // SOS: the entropy-coded scan runs to the end. Copy the rest verbatim.
    if (marker === 0xda) {
      out.push(input.subarray(i));
      break;
    }
    // Standalone markers carry no length payload.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(input.subarray(i, markerStart + 1));
      i = markerStart + 1;
      continue;
    }
    if (markerStart + 2 >= input.length) return input;
    const length = input.readUInt16BE(markerStart + 1);
    if (length < 2) return input;
    const segEnd = markerStart + 1 + length;
    if (segEnd > input.length) return input;

    // Drop APP1..APP15 and COM; keep APP0 (JFIF) and everything structural.
    const isDroppableApp = marker >= 0xe1 && marker <= 0xef;
    const isComment = marker === 0xfe;
    if (!isDroppableApp && !isComment) out.push(input.subarray(i, segEnd));

    i = segEnd;
  }

  const result = Buffer.concat(out);
  return result.length > 0 && result.length < input.length ? result : input;
}

/**
 * Compress a payload for object storage. Never lossy, never larger than the
 * input, never a different format. Safe to call on anything, including bodies
 * that are already optimal — those come back unchanged.
 *
 * Failure is not an error: if an encoder throws on a malformed or exotic file
 * we return the original, because refusing an upload over a failed size
 * optimisation would be the wrong trade.
 */
export async function compressForStorage(
  body: Buffer,
  contentType: string,
): Promise<CompressedPayload> {
  const unchanged: CompressedPayload = { body, contentType };
  if (body.length < MIN_WORTH_COMPRESSING) return unchanged;

  const type = contentType.toLowerCase().split(';')[0].trim();
  if (INCOMPRESSIBLE.test(type)) return unchanged;

  try {
    if (type === 'image/png') {
      const out = await compressPng(body);
      return out.length < body.length ? { body: out, contentType } : unchanged;
    }

    if (type === 'image/webp') {
      // An animated WebP would lose its frames through this path.
      const meta = await sharp(body).metadata();
      if ((meta.pages ?? 1) > 1) return unchanged;
      const out = await compressWebp(body);
      return out.length < body.length ? { body: out, contentType } : unchanged;
    }

    if (type === 'image/jpeg' || type === 'image/jpg') {
      const out = await stripJpegMetadata(body);
      return out.length < body.length ? { body: out, contentType } : unchanged;
    }

    if (TEXT_LIKE.test(type)) {
      const quality =
        body.length > BROTLI_SLOW_PATH_LIMIT
          ? 9
          : zlibConstants.BROTLI_MAX_QUALITY;
      const out = await brotli(body, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: quality,
          [zlibConstants.BROTLI_PARAM_SIZE_HINT]: body.length,
        },
      });
      return out.length < body.length
        ? { body: out, contentType, contentEncoding: 'br' }
        : unchanged;
    }
  } catch {
    // A malformed image is the upload validator's problem, not ours.
    return unchanged;
  }

  return unchanged;
}

/** Reporting helper for logs and tests. */
export function savingsPercent(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.max(0, Math.round(((before - after) / before) * 100));
}
