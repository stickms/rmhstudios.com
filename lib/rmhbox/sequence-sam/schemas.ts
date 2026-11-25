/**
 * RMHbox — Sequence Sam Zod schemas: the client-to-server tap and the settings.
 * Server-side only; the client sends `{ pad }` through emitGameInput.
 */

import { z } from 'zod';
import { SS_PAD_COUNT } from './sequence';

/** A tap on one of the four pads. */
export const TapInputSchema = z.object({
  type: z.literal('tap').optional(),
  pad: z
    .number()
    .int()
    .min(0)
    .max(SS_PAD_COUNT - 1),
});
export type TapInput = z.infer<typeof TapInputSchema>;

/** The host's settings as the handler reads them (the lobby has already clamped them). */
export const SequenceSamSettingsSchema = z.object({
  rounds: z.number().int().min(5).max(12),
  recallSeconds: z.number().int().min(10).max(40),
  stepMs: z.union([z.literal(600), z.literal(900)]),
});
export type SequenceSamSettings = z.infer<typeof SequenceSamSettingsSchema>;
