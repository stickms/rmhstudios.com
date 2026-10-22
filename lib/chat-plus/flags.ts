/**
 * Pure helpers for the columns every new message row carries: attach flags (M6),
 * the disappearing-messages expiry (M3) and the forward label (M10).
 */

/** `attachFlags` bit 1: an image, GIF or voice note. */
export const FLAG_MEDIA = 1;
/** `attachFlags` bit 2: the text contains a link. */
export const FLAG_LINK = 2;

const LINK_RE = /https?:\/\/[^\s<>"'`]+/gi;

/** Links in a message body, trailing punctuation trimmed, de-duplicated. */
export function extractLinks(content: string, max = 20): string[] {
  const out: string[] = [];
  for (const raw of content.match(LINK_RE) ?? []) {
    const url = raw.replace(/[),.;:!?\]}]+$/, '');
    if (url.length > 8 && !out.includes(url)) out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

export function computeAttachFlags(parts: {
  content?: string | null;
  gifUrl?: string | null;
  imageUrls?: string[] | null;
  audioUrl?: string | null;
}): number {
  let flags = 0;
  if (parts.gifUrl || (parts.imageUrls?.length ?? 0) > 0 || parts.audioUrl) flags |= FLAG_MEDIA;
  if (parts.content && new RegExp(LINK_RE.source, 'i').test(parts.content)) flags |= FLAG_LINK;
  return flags;
}

/** The `attachFlags` values that satisfy a media/links tab, for an `in` filter. */
export function flagsForTab(tab: 'media' | 'links'): number[] {
  return tab === 'media'
    ? [FLAG_MEDIA, FLAG_MEDIA | FLAG_LINK]
    : [FLAG_LINK, FLAG_MEDIA | FLAG_LINK];
}

/* -------------------------------------------------------------------------- */
/* Disappearing messages (M3)                                                 */
/* -------------------------------------------------------------------------- */

export const DISAPPEAR_OPTIONS = [3600, 86_400, 604_800] as const;
export type DisappearSeconds = (typeof DISAPPEAR_OPTIONS)[number];

export function isValidDisappearSeconds(v: unknown): v is DisappearSeconds {
  return typeof v === 'number' && (DISAPPEAR_OPTIONS as readonly number[]).includes(v);
}

/** When a message sent `now` in a chat with this timer stops existing. */
export function expiryFor(
  disappearAfterSec: number | null | undefined,
  now = new Date(),
): Date | null {
  if (!disappearAfterSec || disappearAfterSec <= 0) return null;
  return new Date(now.getTime() + disappearAfterSec * 1000);
}

/** The read-time rule: a message with a past `expiresAt` does not exist. */
export function isExpired(expiresAt: Date | string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false;
  const t = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  return t <= now;
}

/* -------------------------------------------------------------------------- */
/* Forwarding (M10)                                                           */
/* -------------------------------------------------------------------------- */

/** A message that has hopped more than this many times is "forwarded many times". */
export const FORWARD_MANY_THRESHOLD = 5;
/** How many chats one forward may target. */
export const FORWARD_MAX_TARGETS = 5;

export type ForwardLabel = 'none' | 'forwarded' | 'many';

export function forwardLabel(forwardCount: number | null | undefined): ForwardLabel {
  const n = forwardCount ?? 0;
  if (n > FORWARD_MANY_THRESHOLD) return 'many';
  return n >= 1 ? 'forwarded' : 'none';
}

/** Highly-forwarded messages may only go to one chat at a time. */
export function maxForwardTargets(forwardCount: number | null | undefined): number {
  return forwardLabel(forwardCount) === 'many' ? 1 : FORWARD_MAX_TARGETS;
}
