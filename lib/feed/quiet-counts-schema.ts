/**
 * Quiet counts (sprint 04 #14) — the zod input schema for `/api/settings/quiet-counts`.
 * Split from `./quiet-counts` so client code that only draws numbers does not bring zod along.
 */

import { z } from 'zod';

/** A partial update: only the switches present change, so each toggle is its own request. */
export const quietCountsUpdateSchema = z
  .object({
    hideCountsOnMine: z.boolean().optional(),
    hideCountsInFeed: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.hideCountsOnMine !== undefined || v.hideCountsInFeed !== undefined, {
    message: 'Send at least one setting.',
  });

export const quietCountsSettingsSchema = z.object({
  hideCountsOnMine: z.boolean(),
  hideCountsInFeed: z.boolean(),
});
