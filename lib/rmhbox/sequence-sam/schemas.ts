/**
 * RMHbox — Sequence Sam Zod Validation Schemas
 *
 * Validates player input for the Sequence Sam minigame.
 * SS_TAP validates a tile tap (position 0–8 on the 3×3 grid).
 */

import { z } from 'zod';

export const SSTapSchema = z.object({
  position: z.number().int().min(0).max(8),
});

export type SSTapInput = z.infer<typeof SSTapSchema>;
