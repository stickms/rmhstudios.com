/**
 * Emoji & sticker packs — the client-safe half: types, validation, and the
 * shortcode resolution rules.
 *
 * ## The membership shape
 *
 * **Creating** a pack is a member feature (`sticker-packs`). **Subscribing** to
 * one and using its contents is free for everyone. That asymmetry is
 * deliberate: members supply the content, and the content is what makes the
 * site feel alive for the people who don't pay. A paywall that also locked
 * *consumption* would make every pack a member-only in-joke and kill the
 * network effect that makes packs worth building in the first place.
 *
 * ## Shortcode resolution
 *
 * Custom shortcodes share a namespace with the 1,913 Unicode shortcodes in
 * `shortcodes.json`, and packs can collide with each other. The precedence is
 * fixed and documented rather than clever:
 *
 *   1. The viewer's subscribed packs, in their own `position` order.
 *   2. Unicode.
 *
 * Packs win over Unicode because a user who installed a `:fire:` pack meant it,
 * and the earlier pack wins over a later one because the subscriber controls
 * that order. Collisions are therefore a preference, never an error — nothing
 * needs to reject a pack for choosing a popular name.
 */

import { z } from 'zod';

export const PACK_KINDS = ['emoji', 'sticker', 'mixed'] as const;
export type PackKind = (typeof PACK_KINDS)[number];

export const ITEM_KINDS = ['emoji', 'sticker'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const PACK_VISIBILITIES = ['public', 'unlisted', 'private'] as const;
export type PackVisibility = (typeof PACK_VISIBILITIES)[number];

export const PACK_STATUSES = ['PENDING', 'APPROVED', 'REMOVED'] as const;
export type PackStatus = (typeof PACK_STATUSES)[number];

/** Ceilings. Generous enough to be useful, bounded enough to stay moderatable. */
export const MAX_ITEMS_PER_PACK = 100;
export const MAX_PACKS_PER_USER = 25;
export const MAX_SUBSCRIPTIONS = 200;
/** Inline emoji render at ~20px; stickers at ~160px. Both are capped at upload. */
export const EMOJI_MAX_DIMENSION = 128;
export const STICKER_MAX_DIMENSION = 512;
export const ITEM_MAX_BYTES = 256 * 1024;

/**
 * Shortcode grammar. Lowercase, alphanumeric plus `_+-`, 2–32 characters.
 * Matches the existing Unicode shortcode grammar in `shortcode-matcher.ts` so
 * a custom code is typeable through exactly the same `:` trigger.
 */
export const SHORTCODE_RE = /^[a-z0-9][a-z0-9_+-]{1,31}$/;

export const shortcodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SHORTCODE_RE, 'Shortcodes are 2–32 characters: letters, numbers, _ + and -');

export const packSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,47}$/, 'Slugs are 2–48 characters: letters, numbers and -');

export const createPackSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).optional(),
  kind: z.enum(PACK_KINDS).default('emoji'),
  visibility: z.enum(PACK_VISIBILITIES).default('public'),
});

export const updatePackSchema = createPackSchema.partial();

export const addItemSchema = z.object({
  name: shortcodeSchema,
  kind: z.enum(ITEM_KINDS).default('emoji'),
  /** Media id from the ordinary upload pipeline — never a raw URL from a client. */
  mediaId: z.string().min(1).max(64),
  alt: z.string().trim().min(1, 'Alt text is required').max(140),
});

export interface PackItem {
  id: string;
  name: string;
  kind: ItemKind;
  url: string;
  alt: string;
  animated: boolean;
}

export interface PackSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: PackKind;
  coverUrl: string | null;
  itemCount: number;
  subscriberCount: number;
  owner: { id: string; name: string | null; handle: string | null };
  /** Whether the viewer has this pack installed. */
  subscribed?: boolean;
}

export interface InstalledPack extends PackSummary {
  items: PackItem[];
}

/**
 * Build the viewer's custom shortcode map from their installed packs.
 *
 * Earlier packs win, per the precedence rule above. Returns a plain object so
 * it serialises into a loader payload without ceremony.
 */
export function resolveCustomShortcodes(packs: readonly InstalledPack[]): Record<string, PackItem> {
  const out: Record<string, PackItem> = {};
  for (const pack of packs) {
    for (const item of pack.items) {
      // First writer wins: packs arrive in subscription order.
      if (!(item.name in out)) out[item.name] = item;
    }
  }
  return out;
}

/** Everything the composer needs to turn `:name:` into something renderable. */
export interface ShortcodeResolution {
  kind: 'custom' | 'unicode' | 'none';
  /** For 'unicode', the emoji character. */
  char?: string;
  /** For 'custom', the item. */
  item?: PackItem;
}

export function resolveShortcode(
  name: string,
  custom: Record<string, PackItem>,
  unicode: Record<string, string>,
): ShortcodeResolution {
  const key = name.toLowerCase();
  const item = custom[key];
  if (item) return { kind: 'custom', item };
  const char = unicode[key];
  if (char) return { kind: 'unicode', char };
  return { kind: 'none' };
}

/**
 * Whether a pack is usable by someone who is not its owner.
 *
 * Private packs never are; unapproved ones never are. The owner always sees
 * their own, which is what makes an unmoderated pack testable by the person who
 * made it without exposing it to anyone else.
 */
export function packUsableBy(
  pack: { ownerId: string; status: string; visibility: string },
  viewerId: string | null,
): boolean {
  if (viewerId && pack.ownerId === viewerId) return true;
  if (pack.status !== 'APPROVED') return false;
  return pack.visibility !== 'private';
}

/** Whether a pack should appear in browse/search listings. */
export function packListable(pack: { status: string; visibility: string }): boolean {
  return pack.status === 'APPROVED' && pack.visibility === 'public';
}

/** Slug candidate from a display name. Callers must still check uniqueness. */
export function slugifyPackName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base.length >= 2 ? base : `pack-${Math.abs(hashString(name)) % 100000}`;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
