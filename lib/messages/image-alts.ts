/**
 * Image descriptions in messages: the pure half, shared by the composers, the
 * rows and the server (no `.server` suffix on purpose, so the client applies the
 * same rules the endpoints enforce).
 *
 * A message carries `imageAlts` index-aligned with `imageUrls`, the same
 * convention as posts: an empty string means "no description". Unlike a post,
 * where a short list is clamped, a message's list must be exactly as long as its
 * images, so a description can never land on the wrong picture.
 */
import { MAX_IMAGE_ALT_LENGTH } from '@/lib/rmhark-limits';

export { MAX_IMAGE_ALT_LENGTH as MAX_MESSAGE_IMAGE_ALT_LENGTH };

/** Descriptions stay editable this long after sending, whatever the 15-minute text window says. */
export const IMAGE_ALT_EDIT_WINDOW_MS = 24 * 60 * 60_000;

/** Both lists, or neither: `alts` may be absent (all undescribed) but never a different length. */
export function imageAltsAligned(
  imageUrls: readonly string[] | null | undefined,
  imageAlts: readonly string[] | null | undefined,
): boolean {
  if (!imageAlts) return true;
  return imageAlts.length === (imageUrls?.length ?? 0);
}

/** The stored form: trimmed, and padded with empty strings so it is exactly as long as `imageUrls`. */
export function normalizeImageAlts(
  imageUrls: readonly string[] | null | undefined,
  imageAlts: readonly string[] | null | undefined,
): string[] {
  return (imageUrls ?? []).map((_, i) => (imageAlts?.[i] ?? '').trim());
}

export interface DescribableMessage {
  senderId: string;
  createdAt: Date | string;
  deletedAt?: Date | string | null;
  imageUrls?: readonly string[] | null;
}

export type AltEditRefusal = 'not-sender' | 'deleted' | 'no-images' | 'window-expired';

function ms(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/** May `viewerId` change this message's image descriptions right now? */
export function altEditEligibility(
  message: DescribableMessage,
  viewerId: string,
  now: number = Date.now(),
):
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: AltEditRefusal;
    } {
  if (message.senderId !== viewerId)
    return {
      ok: false,
      reason: 'not-sender',
    };
  if (message.deletedAt)
    return {
      ok: false,
      reason: 'deleted',
    };
  if ((message.imageUrls?.length ?? 0) === 0)
    return {
      ok: false,
      reason: 'no-images',
    };
  if (ms(message.createdAt) + IMAGE_ALT_EDIT_WINDOW_MS <= now) {
    return {
      ok: false,
      reason: 'window-expired',
    };
  }
  return {
    ok: true,
  };
}

export function canEditImageAlts(message: DescribableMessage, viewerId: string, now: number = Date.now()): boolean {
  return altEditEligibility(message, viewerId, now).ok;
}

/** HTTP status for each refusal. */
export function altEditStatus(reason: AltEditRefusal): number {
  switch (reason) {
    case 'deleted':
      return 409;
    case 'no-images':
      return 400;
    default:
      return 403;
  }
}

export function altEditMessage(reason: AltEditRefusal): string {
  switch (reason) {
    case 'not-sender':
      return 'You can only change your own messages.';
    case 'deleted':
      return 'This message was already deleted.';
    case 'no-images':
      return 'This message has no images.';
    case 'window-expired':
      return 'Descriptions can be changed for 24 hours after sending.';
  }
}
