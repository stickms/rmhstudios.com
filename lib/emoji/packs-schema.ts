/**
 * Emoji & sticker packs — the zod input schemas for the pack API routes.
 * Split from `./packs`, which the emoji picker in every composer imports for the
 * types and shortcode rules, so the picker stays zod-free.
 */
import { z } from 'zod';

import { ITEM_KINDS, PACK_KINDS, PACK_VISIBILITIES, SHORTCODE_RE } from './packs';

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
