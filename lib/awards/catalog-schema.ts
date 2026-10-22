/**
 * Awards — the zod schema for giving an award. Split from `./catalog`, which
 * the award row on builds and posts imports, so those pages stay zod-free.
 */
import { z } from 'zod';

import { AWARD_ENTITY_TYPES } from './catalog';

export const giveAwardSchema = z.object({
  awardId: z.string().min(1).max(32),
  entityType: z.enum(AWARD_ENTITY_TYPES),
  entityId: z.string().min(1).max(64),
  anonymous: z.boolean().optional(),
});

export type GiveAwardInput = z.infer<typeof giveAwardSchema>;
