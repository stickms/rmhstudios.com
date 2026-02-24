/**
 * Scroll Soul — Zod Validation Schemas
 *
 * Validates client inputs (movement, ad close attempts)
 * for the server-side handler.
 *
 * Reference: docs/rmhbox/design-spec/minigames-4.md §4.5
 */

import { z } from 'zod';

/** Validates a movement input from the client. dx is horizontal direction, jump is a boolean. */
export const SCInputSchema = z.object({
  dx: z.number().min(-1).max(1),
  jump: z.boolean(),
});

/** Validates a close-ad attempt from the client. */
export const SCCloseAdSchema = z.object({
  adId: z.string().min(1),
  clickPosition: z.object({ x: z.number(), y: z.number() }),
});

export type SCMoveInput = z.infer<typeof SCInputSchema>;
export type SCCloseAdInput = z.infer<typeof SCCloseAdSchema>;
