/**
 * P5 — the stamp wall: client-safe limits and schemas.
 *
 * A stamp is a tiny image (think an 88×31 web button) that members design and
 * others collect onto their profile wall. The limits are strict on purpose:
 * small images are cheap to store and serve, hard to hide anything in, and they
 * are what makes a wall of 50 look like a wall rather than a gallery.
 */
import { z } from 'zod';
import { CDN_BASE } from '@/lib/storage/asset';

/** Largest edge accepted, in pixels. Larger uploads are refused, never resized. */
export const STAMP_MAX_EDGE = 176;
/** Smallest edge accepted — below this it is not a picture. */
export const STAMP_MIN_EDGE = 16;
/** Accepted upload size. */
export const STAMP_MAX_UPLOAD_BYTES = 96 * 1024;
/** Ceiling on the re-encoded object we actually store. */
export const STAMP_MAX_STORED_BYTES = 64 * 1024;
/** Accepted formats (sniffed from bytes, never from the file's claimed type). */
export const STAMP_MIME = ['image/png', 'image/gif', 'image/webp'] as const;

/** Stamps one member may create in total / per rolling day. */
export const STAMP_MAX_CREATED = 12;
export const STAMP_MAX_PER_DAY = 3;
/** Stamps on one profile wall. */
export const STAMP_WALL_CAP = 50;

export const STAMP_NAME_MAX = 40;
export const stampNameSchema = z.string().trim().min(1).max(STAMP_NAME_MAX);

export interface StampView {
  id: string;
  name: string;
  imageUrl: string;
  width: number;
  height: number;
  addCount: number;
  creator: { id: string; name: string | null; handle: string | null };
  /** True when the signed-in viewer already has it on their wall. */
  onMyWall?: boolean;
}

/** Why an uploaded image was refused — each maps to one user-facing message. */
export type StampRejection = 'empty' | 'too-large' | 'format' | 'too-big-dimensions' | 'too-small';

/**
 * Judge an upload from facts the server read off the bytes. Pure so the limits
 * can be tested and the client can pre-check a file before sending it.
 */
export function judgeStampImage(args: {
  bytes: number;
  mime: string | null;
  width: number | null;
  height: number | null;
}): StampRejection | null {
  if (args.bytes <= 0) return 'empty';
  if (args.bytes > STAMP_MAX_UPLOAD_BYTES) return 'too-large';
  if (!args.mime || !(STAMP_MIME as readonly string[]).includes(args.mime)) return 'format';
  if (!args.width || !args.height) return 'format';
  if (args.width > STAMP_MAX_EDGE || args.height > STAMP_MAX_EDGE) return 'too-big-dimensions';
  if (args.width < STAMP_MIN_EDGE || args.height < STAMP_MIN_EDGE) {
    // Allow the classic 88x31 button: one thin edge is fine when the other is wide.
    if (
      Math.max(args.width, args.height) < STAMP_MIN_EDGE * 2 ||
      Math.min(args.width, args.height) < 8
    ) {
      return 'too-small';
    }
  }
  return null;
}

/** Object-storage prefix for stamp images. */
export const STAMP_PREFIX = 'profile-stamps/';

export function stampKey(filename: string): string {
  return `${STAMP_PREFIX}${filename}`;
}

/** CDN URL when one is configured, else the Node proxy route (dev / no CDN). */
export function stampUrl(filename: string): string {
  return CDN_BASE ? `${CDN_BASE}/${stampKey(filename)}` : `/api/stamps/image/${filename}`;
}
