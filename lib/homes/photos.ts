/**
 * Listing photo descriptions (s11 14), the pure half. `HomeListing.imageAlts` is a list beside `images`, the same
 * length and order, `''` meaning "not described". Everything that changes one list changes the other through these
 * helpers, so the two cannot drift: the server pads or truncates on every write (`normalizeAlts`) and the form moves
 * and removes photos with their descriptions (`movePhoto`, `removePhoto`). Client-safe: no server imports.
 */
import { refusalBody, type ErrorCode } from '@/lib/errors/codes';

/** Longest description (the same limit as a flashcard picture's, `CARD_IMAGE_ALT_MAX`). */
export const LISTING_PHOTO_ALT_MAX = 1000;

const LINE_BREAKS = /[\t\r\n]+/g;

function isControl(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

/** Line breaks and tabs become one space; every other control character is removed. */
function stripControl(value: string): string {
  let out = '';
  for (const ch of value.replace(LINE_BREAKS, ' ')) if (!isControl(ch.codePointAt(0) ?? 0)) out += ch;
  return out;
}

/** One description as it is stored: control characters removed, then trimmed. */
export function cleanAlt(value: unknown): string {
  if (typeof value !== 'string') return '';
  return stripControl(value).trim();
}

/**
 * `alts` as stored for `images`: one entry per photo, cleaned, `''` for a photo with none. A longer list is cut to
 * the photos, a shorter one is padded. A description over the limit is cut too, as a last resort; the write routes
 * refuse one before they get here (`imageAltsRefusal`).
 */
export function normalizeAlts(images: readonly string[], alts: readonly unknown[] | null | undefined): string[] {
  return images.map((_, i) => cleanAlt(alts?.[i]).slice(0, LISTING_PHOTO_ALT_MAX));
}

/** The refusal body for a description over the limit, or `null` when every one fits. */
export function imageAltsRefusal(alts: readonly unknown[] | null | undefined): ReturnType<typeof refusalBody> | null {
  const tooLong = (alts ?? []).some((alt) => cleanAlt(alt).length > LISTING_PHOTO_ALT_MAX);
  const code: ErrorCode = 'LISTING_PHOTO_ALT_TOO_LONG';
  return tooLong ? refusalBody(code, { max: LISTING_PHOTO_ALT_MAX }) : null;
}

/** A listing's photos and their descriptions, side by side. */
export interface PhotoSet {
  images: string[];
  alts: string[];
}

/** Move the photo at `from` to `to` (both clamped into the list); its description goes with it. */
export function movePhoto(set: PhotoSet, from: number, to: number): PhotoSet {
  const images = [...set.images];
  const alts = normalizeAlts(images, set.alts);
  if (from < 0 || from >= images.length) return { images, alts };
  const target = Math.min(Math.max(to, 0), images.length - 1);
  if (target === from) return { images, alts };
  const [image] = images.splice(from, 1);
  const [alt] = alts.splice(from, 1);
  images.splice(target, 0, image as string);
  alts.splice(target, 0, alt as string);
  return { images, alts };
}

/** Remove the photo at `index` and its description. */
export function removePhoto(set: PhotoSet, index: number): PhotoSet {
  const alts = normalizeAlts(set.images, set.alts);
  if (index < 0 || index >= set.images.length) return { images: [...set.images], alts };
  return {
    images: set.images.filter((_, i) => i !== index),
    alts: alts.filter((_, i) => i !== index),
  };
}

/** Add a photo (with no description yet, or `alt`) at the end. */
export function appendPhotos(set: PhotoSet, urls: readonly string[]): PhotoSet {
  return {
    images: [...set.images, ...urls],
    alts: [...normalizeAlts(set.images, set.alts), ...urls.map(() => '')],
  };
}

/** Change the description of the photo at `index`. */
export function setPhotoAlt(set: PhotoSet, index: number, alt: string): PhotoSet {
  const alts = normalizeAlts(set.images, set.alts);
  if (index < 0 || index >= alts.length) return { images: [...set.images], alts };
  // Keep what the member typed (spaces included) while they type; the server cleans on save.
  alts[index] = stripControl(alt).slice(0, LISTING_PHOTO_ALT_MAX);
  return { images: [...set.images], alts };
}

/** How many photos have no description. */
export function undescribedCount(images: readonly string[], alts: readonly unknown[] | null | undefined): number {
  return normalizeAlts(images, alts).filter((alt) => alt === '').length;
}

/** What a photo's text alternative is made of: the description, or the parts of the fallback sentence. */
export type PhotoAlt =
  { kind: 'described'; text: string } | { kind: 'fallback'; index: number; total: number; title: string };

/** The text alternative of photo `index` (0-based) of a listing: its description, else "Photo n of m: <title>". */
export function photoAlt(
  listing: { images: readonly string[]; imageAlts?: readonly unknown[] | null | undefined; title: string },
  index: number,
): PhotoAlt {
  const described = cleanAlt(listing.imageAlts?.[index]);
  if (described) return { kind: 'described', text: described };
  return { kind: 'fallback', index: index + 1, total: listing.images.length, title: listing.title };
}

/** The description of a listing's cover for a card: the first photo's description, else the listing's title. */
export function coverAlt(listing: {
  images: readonly string[];
  imageAlts?: readonly unknown[] | null | undefined;
  title: string;
}): string {
  return cleanAlt(listing.imageAlts?.[0]) || listing.title;
}

/** Wrap member text so the sentence around it keeps its direction (a first-strong isolate). */
export function isolateText(text: string): string {
  return `⁨${text}⁩`;
}
