/**
 * RMHbox — Human Tetris Zod Validation Schemas
 *
 * Validates client-to-server input payloads for the Human Tetris minigame.
 * - HTMoveSchema: directional movement (up/down/left/right)
 *
 * Reference: docs/rmhbox/design-spec/minigames-3.md §4.5
 */

import { z } from 'zod';

/** Validates a player movement input: one of four cardinal directions. */
export const HTMoveSchema = z.object({
  direction: z.enum(['up', 'down', 'left', 'right']),
});

export type HTMoveInput = z.infer<typeof HTMoveSchema>;
