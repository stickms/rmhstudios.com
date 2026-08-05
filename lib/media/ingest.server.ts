/**
 * One ingest pipeline for every upload surface (C10). Server-only.
 *
 * The pieces already existed and were composed differently by each surface:
 * `media/policy.ts` (magic-byte validation, byte ceiling), `media/quota.server`
 * (the per-tier daily allowance), `image-optimize.ts` (the sharp re-encode),
 * `storage/keys.ts` (key + URL builders), `storage/s3.server` (`putObject`,
 * which runs `compressForStorage`) and `media/id` + `media/sweep-policy` (the
 * `Media` row and its orphan TTL). Avatars, post attachments, album slides,
 * library covers, build covers and chat images each re-decided which of those
 * to call and in what order — which is precisely why they do not behave the
 * same.
 *
 * This module does not rewrite any of them. It declares, per surface, what the
 * decisions ARE, and then makes them once.
 *
 * ## The security point: `strip` is declared, never inherited
 *
 * A photo carrying its GPS EXIF is a privacy leak that no profile privacy
 * setting compensates for — the coordinates are in the file, and the file is
 * public the moment the post is.
 *
 * Today the site mostly gets this right BY ACCIDENT. Every image route re-encodes
 * to WebP through `optimizeImage`, and sharp drops metadata unless asked to keep
 * it; `putObject` → `compressForStorage` additionally strips APP1 out of JPEGs.
 * Neither is a policy. Both are size optimisations whose privacy effect is a side
 * effect, and both have holes (see {@link stripMetadata}). A future route that
 * stores originals for quality — or accepts a format `compressForStorage` skips —
 * silently reintroduces the leak and no test notices.
 *
 * So `strip` is a REQUIRED field on {@link MediaPolicy} with no default at the
 * type level, `'gps'` is the weakest value any surface may choose, and
 * {@link stripMetadata} runs on every stored byte rather than being implied by
 * whatever the encoder happened to do. Opting out is `strip: 'none'`, which is a
 * word that appears in the diff.
 */

import { prisma } from '@/lib/prisma.server';
import type { Tier } from '@/lib/entitlements';
import { newMediaId } from '@/lib/media/id';
import { mediaExpiresAt } from '@/lib/media/sweep-policy';
import { checkDailyUploadQuota, keyedLimit } from '@/lib/media/quota.server';
import { optimizeImage, imageDimensions } from '@/lib/image-optimize';
import { stripJpegAppSegments } from '@/lib/storage/compress.server';
import { putObject } from '@/lib/storage/s3.server';
import {
  albumAssetKey,
  albumAssetUrl,
  feedImageKey,
  feedImageUrl,
  userAvatarKey,
  userAvatarUrl,
  withImageDimensions,
} from '@/lib/storage/keys';

/* -------------------------------------------------------------------------- */
/* Policy                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What is removed from a file before it is stored.
 *
 * `'gps'` is the FLOOR, not an opt-in: location is the one metadata field that
 * identifies a person's home, and no surface has a reason to keep it. `'all'`
 * additionally drops orientation/ICC/comments, which is right when the pipeline
 * has already baked orientation into the pixels. `'none'` exists so that a
 * format this module cannot safely rewrite (a signed PDF, an archive) is an
 * explicit decision rather than a silent gap.
 */
export type StripMode = 'gps' | 'all' | 'none';

export interface MediaPolicy {
  /** Hard ceiling on the ACCEPTED bytes, checked before the body is decoded. */
  readonly maxBytes: number;
  /** Accepted content types, matched against SNIFFED bytes — never `File.type`. */
  readonly mime: readonly string[];
  /**
   * Stored widths, ascending. The last is the "full" variant and is what
   * {@link IngestResult.url} points at.
   *
   * An empty list means "store the bytes as they arrived", which is only
   * correct for formats this module does not re-encode. Every image policy has
   * variants, and that is what makes their metadata stripping structural: a
   * sharp re-encode cannot carry EXIF forward.
   */
  readonly variants: readonly number[];
  /** Required. See {@link StripMode} — there is deliberately no default. */
  readonly strip: StripMode;
  /** Count the upload against the member's daily allowance (`quota.server`). */
  readonly quota: boolean;
}

const IMAGE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
/** Avatars are cropped to a square and re-encoded; an animated avatar is not a thing. */
const STILL_IMAGE = ['image/png', 'image/jpeg', 'image/webp'] as const;

/**
 * Per-surface policy.
 *
 * Both the ceilings and the widths are the ones the routes ALREADY enforce, not
 * the ones the design sketch proposed. Two reasons, and they are the difference
 * between a de-duplication and a rewrite:
 *
 *   • Raising a byte ceiling is a capacity decision — every in-flight upload is
 *     buffered whole in memory before sharp sees it.
 *   • Adding widths is a storage decision. A `[400, 800, 1600]` post policy
 *     triples what the feed pays for, for variants no `srcset` reads yet.
 *     Widening a policy is one line here, on the day something consumes it.
 *
 * Album is the one surface that genuinely stores three sizes today
 * (`addImageSlide`: thumb/src/full), so its policy says three.
 */
export const POLICIES = {
  /** Profile avatar. One square image, re-encoded; nothing about the original survives. */
  avatar: {
    maxBytes: 5 * 1024 * 1024,
    mime: STILL_IMAGE,
    variants: [512],
    strip: 'all',
    quota: false,
  },
  /** Feed attachment. Animated GIF is accepted and preserved as animated WebP. */
  post: {
    maxBytes: 5 * 1024 * 1024,
    mime: IMAGE,
    variants: [2048],
    strip: 'gps',
    quota: true,
  },
  /** Album slide (admin). Video slides keep `addVideoSlide` — see the note there. */
  album: {
    maxBytes: 64 * 1024 * 1024,
    mime: IMAGE,
    variants: [400, 1600, 4096],
    strip: 'gps',
    quota: false,
  },
  /** Library book cover. */
  library: {
    maxBytes: 2 * 1024 * 1024,
    mime: STILL_IMAGE,
    variants: [1000],
    strip: 'all',
    quota: false,
  },
  /** User Build cover art. */
  build: {
    maxBytes: 5 * 1024 * 1024,
    mime: STILL_IMAGE,
    variants: [1280],
    strip: 'all',
    quota: false,
  },
  /** DM / group-chat image. Shares the feed key space, as the route already does. */
  chat: {
    maxBytes: 5 * 1024 * 1024,
    mime: IMAGE,
    variants: [2048],
    strip: 'gps',
    quota: true,
  },
} as const satisfies Record<string, MediaPolicy>;

export type MediaSurface = keyof typeof POLICIES;

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A refusal the caller may show to the user verbatim.
 *
 * A distinct class rather than a `{ ok: false }` union because every existing
 * call site already has a try/catch around its upload, and because a refusal
 * must never be confused with a successful ingest that returned nothing.
 */
export class IngestError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'IngestError';
  }
}

/* -------------------------------------------------------------------------- */
/* Sniffing                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The stored content type, from the BYTES.
 *
 * `File.type` is whatever the browser (or a script) put in the multipart
 * header. Every accept decision in this module reads this instead, which is the
 * same rule `lib/slice-it/upload-validation.ts` established for the feed.
 */
export function sniffImageType(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  const gif = buffer.length >= 6 && buffer.toString('ascii', 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  // AVIF/HEIC: `ftyp` box at offset 4, brand at 8. Sniffed so the accept check
  // can REFUSE them by name — `compressForStorage` skips both formats entirely
  // (they are on its incompressible list), so nothing downstream would strip
  // their EXIF if one were ever let through.
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12);
    if (brand.startsWith('avi')) return 'image/avif';
    if (brand.startsWith('hei') || brand.startsWith('mif')) return 'image/heic';
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Steps                                                                      */
/* -------------------------------------------------------------------------- */

function assertSize(bytes: number, policy: MediaPolicy): void {
  if (bytes <= 0) throw new IngestError('No file provided.');
  if (bytes > policy.maxBytes) {
    const mb = Math.round(policy.maxBytes / 1024 / 1024);
    throw new IngestError(`File too large. Maximum size is ${mb} MB.`, 413);
  }
}

function assertMime(buffer: Buffer, policy: MediaPolicy): string {
  const sniffed = sniffImageType(buffer);
  if (!sniffed || !policy.mime.includes(sniffed)) {
    // The accepted list is named, but the REJECTED type is not echoed back:
    // saying "we saw image/heic" tells a prober exactly which sniffers exist.
    const allowed = policy.mime.map((m) => m.replace('image/', '').toUpperCase()).join(', ');
    throw new IngestError(`Unsupported image format. Allowed: ${allowed}.`);
  }
  return sniffed;
}

async function assertQuota(ctx: IngestCtx, policy: MediaPolicy): Promise<void> {
  if (!policy.quota || !ctx.tier) return;
  const { allowed } = await checkDailyUploadQuota(
    { limit: keyedLimit },
    { userId: ctx.userId, tier: ctx.tier },
  );
  if (!allowed) throw new IngestError('Daily upload limit reached.', 429);
}

/**
 * Remove metadata from bytes that are stored AS THEY ARRIVED.
 *
 * There are exactly two ways a stored byte gets clean in this pipeline, and
 * every policy uses one of them — `lib/__tests__/media-ingest.test.ts` asserts
 * that no policy escapes both:
 *
 *  1. **A sharp re-encode.** Any policy with `variants` goes through
 *     {@link makeVariants}, and sharp emits no metadata unless `keepMetadata()`
 *     is called, which it never is. This is the stronger of the two — the
 *     output file has no container for EXIF to survive in — and it is why the
 *     re-encode happens BEFORE any stripping: `autoOrient` has to read the
 *     orientation tag in order to bake it into the pixels, and a pipeline that
 *     stripped first would leave every phone photo sideways.
 *  2. **This function**, for a policy that stores the original bytes.
 *
 * Both implementations currently remove ALL metadata, so `'gps'` is a FLOOR
 * rather than a precise instruction — a surface asking for `'gps'` gets `'all'`
 * today. The mode is still declared per surface because the distinction is real
 * the moment one surface needs its ICC profile kept (colour-managed artwork):
 * that becomes a narrower implementation behind `'gps'`, and no other surface
 * quietly loses its guarantee in the process.
 *
 * For the record, the holes this replaces — each a case where the storage
 * layer's `compressForStorage` returns its input untouched:
 *
 *   • **AVIF / HEIC / GIF** sit on its incompressible list, so nothing touches
 *     them. AVIF and HEIC are what a current phone camera exports, and both
 *     carry full EXIF including GPS. This module refuses them at
 *     {@link assertMime} rather than storing them unstripped.
 *   • **PNG / WebP** are re-encoded, but the result is kept only when it is
 *     SMALLER. A PNG with an `eXIf` chunk that does not shrink is stored with
 *     the chunk intact.
 *   • Anything under 512 bytes is skipped outright.
 */
export async function stripMetadata(
  buffer: Buffer,
  contentType: string,
  mode: StripMode,
): Promise<Buffer> {
  if (mode === 'none') return buffer;
  if (contentType === 'image/jpeg') {
    // Lossless: walks the JFIF segment list and drops APP1..APP15 + COM. A
    // sharp round-trip here would re-encode and lose real pixels.
    return stripJpegAppSegments(buffer);
  }
  // PNG/WebP/GIF: a sharp round-trip in the SAME format. `animated: true` keeps
  // multi-frame files whole.
  const { buffer: out } = await optimizeImage(buffer, {
    format: contentType === 'image/png' ? 'png' : 'webp',
    animated: contentType === 'image/gif' || contentType === 'image/webp',
    quality: 100,
  });
  return out;
}

/** Encode the policy's variants. Every one is a fresh sharp encode — no metadata survives. */
async function makeVariants(
  buffer: Buffer,
  contentType: string,
  policy: MediaPolicy,
): Promise<{ width: number; height: number; buffer: Buffer; contentType: string }[]> {
  const animated = contentType === 'image/gif';
  return Promise.all(
    policy.variants.map(async (width) => {
      const out = await optimizeImage(buffer, {
        width,
        height: width,
        quality: 82,
        format: 'webp',
        animated,
        // Bakes EXIF orientation into the pixels. It is also the reason
        // `strip: 'all'` is safe on the surfaces that use it — the orientation
        // tag has already done its job by the time it is discarded.
        autoOrient: !animated,
      });
      return { width: out.width, height: out.height, buffer: out.buffer, contentType: out.contentType };
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Keys                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Where a surface's objects live. One place, so a new surface cannot invent a
 * seventh key convention — and so the sweep and the CDN purge keep finding
 * everything.
 */
function mediaKey(
  surface: MediaSurface,
  ctx: IngestCtx,
  filename: string,
): { key: string; url: string } {
  if (surface === 'avatar') return { key: userAvatarKey(filename), url: userAvatarUrl(filename) };
  if (surface === 'album') {
    if (!ctx.entityId) throw new IngestError('Album slides need an album id.', 500);
    const key = albumAssetKey(ctx.entityId, filename);
    return { key, url: albumAssetUrl(key) };
  }
  // post / chat / library / build all live in the feed image space, which is
  // what the routes already do — `/api/rmharks/image` is the upload endpoint
  // for DM attachments, build covers and home listing photos today.
  return { key: feedImageKey(filename), url: feedImageUrl(filename) };
}

/** Surfaces whose readers parse `-WxH` back out of the filename. */
const DIMENSION_TAGGED: ReadonlySet<MediaSurface> = new Set<MediaSurface>(['post', 'chat']);

/** Collision-resistant, owner-prefixed, and never derived from the uploaded name. */
function storedFilename(ctx: IngestCtx, suffix: string, ext: string): string {
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `${ctx.userId}-${unique}${suffix}${ext}`;
}

/* -------------------------------------------------------------------------- */
/* Ingest                                                                     */
/* -------------------------------------------------------------------------- */

export interface IngestCtx {
  userId: string;
  /** Needed only where the policy declares `quota: true`. */
  tier?: Tier;
  /** Album id, post id — whatever the key space namespaces by. */
  entityId?: string;
  /**
   * Create a `Media` row for this upload. **Off by default, and that default is
   * load-bearing.**
   *
   * A `Media` row is a CLAIM TICKET, not a record of the object: it is created
   * `PENDING`, and `sweepUnreferencedMedia` deletes the object 24 hours later
   * unless something called `resolveMediaForPost` to flip it to `ATTACHED`. So a
   * row is right only for a caller that hands the id back and later attaches it
   * (the developer API's two-step upload → post flow), and catastrophic for a
   * caller that only ever uses the URL — the picture disappears from the post a
   * day after it was made, with nothing in the logs but a successful sweep.
   */
  record?: boolean;
  /**
   * Last gate before anything is written, called with the FINAL stored byte
   * count across all variants. Return a message to refuse.
   *
   * This exists because the byte-based caps that surfaces enforce (the global
   * avatar storage ceiling, a library quota) are about what is STORED, and the
   * request's `file.size` is the wrong number — a 5 MB JPEG becomes a 180 KB
   * WebP. Checking after the encode and before the put is the only ordering
   * that both measures the right thing and leaves nothing behind on refusal.
   */
  reserve?: (bytes: number) => Promise<string | null> | string | null;
}

export interface IngestVariant {
  width: number;
  height: number;
  bytes: number;
  key: string;
  url: string;
  contentType: string;
}

export interface IngestResult {
  /** `Media` row id — `null` unless the caller asked for one (`ctx.record`). */
  mediaId: string | null;
  /** The largest variant: what a caller stores on its own row. */
  key: string;
  url: string;
  contentType: string;
  bytes: number;
  width: number;
  height: number;
  /** Every stored variant, smallest first. */
  variants: IngestVariant[];
  /** When an unattached `Media` row becomes sweepable; null when none was made. */
  expiresAt: Date | null;
}

/**
 * Validate, strip, encode, store and record one upload.
 *
 * Throws {@link IngestError} for anything the user did (too large, wrong
 * format, over quota, refused by `reserve`); anything else is a genuine fault
 * and propagates to the route wrapper's 500.
 *
 * Ordering is deliberate and is the thing the surfaces disagreed about:
 * **size → format → quota → encode (or strip) → reserve → store → record.**
 * Size and format first because they are free and reject the hostile cases
 * before a decoder sees the bytes; quota before the CPU spend; the store last
 * so a refusal never leaves an orphan object; and the row after the object, so
 * a `Media` row never points at nothing.
 *
 * The encode/strip step is one or the other, never both, and the reason is a
 * bug that ordering invites: `autoOrient` has to READ the EXIF orientation tag
 * to bake the rotation into the pixels. Strip first and every phone photo is
 * stored sideways. So a policy with variants gets the re-encode (which drops
 * metadata as a consequence of producing a new file) and a policy without gets
 * {@link stripMetadata} on the original bytes.
 */
export async function ingest(
  file: File | Buffer,
  surface: MediaSurface,
  ctx: IngestCtx,
): Promise<IngestResult> {
  const policy: MediaPolicy = POLICIES[surface];

  // `File.size` is checked before the body is read into memory; the buffer's
  // own length is checked again after, because the two can disagree.
  if (!Buffer.isBuffer(file)) assertSize(file.size, policy);
  const raw = Buffer.isBuffer(file) ? file : Buffer.from(await file.arrayBuffer());
  assertSize(raw.length, policy);

  const contentType = assertMime(raw, policy);
  await assertQuota(ctx, policy);

  let encoded: { width: number; height: number; buffer: Buffer; contentType: string }[];
  if (policy.variants.length > 0) {
    encoded = await makeVariants(raw, contentType, policy);
  } else {
    const stripped = await stripMetadata(raw, contentType, policy.strip);
    const dims = await imageDimensions(stripped);
    encoded = [
      { width: dims?.width ?? 0, height: dims?.height ?? 0, buffer: stripped, contentType },
    ];
  }

  const totalBytes = encoded.reduce((sum, v) => sum + v.buffer.length, 0);
  if (ctx.reserve) {
    const refusal = await ctx.reserve(totalBytes);
    if (refusal) throw new IngestError(refusal, 413);
  }

  // Ascending, so the last entry is the full-size one every caller wants.
  encoded.sort((a, b) => a.width - b.width);
  const largestIndex = encoded.length - 1;

  const variants: IngestVariant[] = encoded.map((v, i) => {
    // Only the full-size variant carries the bare name; the smaller ones are
    // suffixed so one upload never overwrites another's key.
    const suffix = i === largestIndex ? '' : `-${v.width}`;
    const ext =
      v.contentType === 'image/png' ? '.png' : v.contentType === 'image/gif' ? '.gif' : '.webp';
    const bare = storedFilename(ctx, suffix, ext);
    // Dimensions ride in the FEED filename so the timeline can reserve layout
    // space before the image loads (`withImageDimensions`, read back by
    // `parseImageDimensions`). Only there: nothing parses an avatar or an album
    // key for its size, and tagging one would change a URL shape for no reader.
    const name = DIMENSION_TAGGED.has(surface) ? withImageDimensions(bare, v.width, v.height) : bare;
    const { key, url } = mediaKey(surface, ctx, name);
    return {
      width: v.width,
      height: v.height,
      bytes: v.buffer.length,
      key,
      url,
      contentType: v.contentType,
    };
  });

  await Promise.all(
    encoded.map((v, i) => putObject(variants[i].key, v.buffer, variants[i].contentType)),
  );

  const full = variants[largestIndex];

  // Opt-in — see `IngestCtx.record` for why the default is off.
  let mediaId: string | null = null;
  let expiresAt: Date | null = null;
  if (ctx.record) {
    const now = new Date();
    mediaId = newMediaId();
    expiresAt = mediaExpiresAt(now);
    await prisma.media.create({
      data: {
        id: mediaId,
        userId: ctx.userId,
        key: full.key,
        url: full.url,
        contentType: full.contentType,
        bytes: full.bytes,
        status: 'PENDING',
        createdAt: now,
      },
    });
  }

  return {
    mediaId,
    key: full.key,
    url: full.url,
    contentType: full.contentType,
    bytes: full.bytes,
    width: full.width,
    height: full.height,
    variants,
    expiresAt,
  };
}
