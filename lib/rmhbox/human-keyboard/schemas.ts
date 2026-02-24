/**
 * RMHbox — Human Keyboard Zod Validation Schemas
 *
 * Validates player input for the Human Keyboard minigame.
 * HK_PRESS validates a single lowercase letter key press.
 */

import { z } from 'zod';

export const HKPressSchema = z.object({
  key: z.string().length(1).regex(/^[a-z]$/),
});

export type HKPressInput = z.infer<typeof HKPressSchema>;
