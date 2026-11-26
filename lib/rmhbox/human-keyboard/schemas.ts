/**
 * RMHbox — Human Keyboard Zod schemas: the client-to-server key press and the settings.
 * Server-side only; the client sends `{ key }` through emitGameInput.
 */

import { z } from 'zod';
import { HK_MAX_RESHUFFLE_SECONDS, HK_MAX_ROUNDS, HK_MIN_RESHUFFLE_SECONDS, HK_MIN_ROUNDS } from './settings';

/** One lowercase letter. */
export const PressInputSchema = z.object({
  type: z.literal('press').optional(),
  key: z.string().regex(/^[a-z]$/),
});
export type PressInput = z.infer<typeof PressInputSchema>;

/** The host's settings as the handler reads them (the lobby has already clamped them). */
export const HumanKeyboardSettingsSchema = z.object({
  rounds: z.number().int().min(HK_MIN_ROUNDS).max(HK_MAX_ROUNDS),
  reshuffleSeconds: z.number().int().min(HK_MIN_RESHUFFLE_SECONDS).max(HK_MAX_RESHUFFLE_SECONDS),
});
export type HumanKeyboardSettings = z.infer<typeof HumanKeyboardSettingsSchema>;
