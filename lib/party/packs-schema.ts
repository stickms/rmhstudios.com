/**
 * Community party packs — the zod input schemas for the pack API routes. Split
 * from `./packs`, which the /rmhbox-packs page imports for the limits.
 */
import { z } from 'zod';

import { PACK_GAMES, PACK_MAX_PROMPTS, PACK_MIN_PROMPTS } from './packs';

export const createPackSchema = z.object({
  name: z.string().trim().min(3).max(60),
  game: z.enum(PACK_GAMES).default('wit-war'),
  prompts: z.array(z.string().trim().min(8).max(120)).min(PACK_MIN_PROMPTS).max(PACK_MAX_PROMPTS),
});

export type CreatePackInput = z.infer<typeof createPackSchema>;

export const reportPackSchema = z.object({ reason: z.string().trim().min(3).max(200) });

export const adminPackSchema = z.object({
  featured: z.boolean().optional(),
  hidden: z.boolean().optional(),
});
