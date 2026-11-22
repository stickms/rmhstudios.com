/** Zod inputs for the post-description endpoints (sprint 05 #16). Server-side only: the contract imports types from here. */
import { z } from 'zod';
import { MAX_GIF_ALT_LENGTH } from '@/lib/feed/gif-alt';
import { MAX_IMAGE_ALT_LENGTH, MAX_RMHARK_IMAGES, decodeCursor } from '@/lib/feed/alt-text-edit';

/**
 * The whole list, one entry per image (empty for a post that has only a GIF), and/or the GIF's description; the
 * endpoint checks both against the post. `gifAlt: null` or '' clears the GIF's description.
 */
export const editPostAltsBodySchema = z.object({
  alts: z
    .array(z.string().max(MAX_IMAGE_ALT_LENGTH, `A description must be at most ${MAX_IMAGE_ALT_LENGTH} characters`))
    .max(MAX_RMHARK_IMAGES)
    .default([]),
  gifAlt: z
    .string()
    .max(MAX_GIF_ALT_LENGTH, `A description must be at most ${MAX_GIF_ALT_LENGTH} characters`)
    .nullish(),
});

export const missingAltQuerySchema = z.object({
  after: z
    .string()
    .max(200)
    .refine((v) => decodeCursor(v) !== null, 'Invalid cursor')
    .optional(),
});
