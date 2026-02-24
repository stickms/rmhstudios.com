/**
 * RMHbox — Cursor Curling Zod Validation Schemas
 *
 * Validates client-to-server input payloads for the Cursor Curling minigame.
 * - ThrowStoneSchema: angle (±π/2 from vertical) and power (0–1)
 * - SweepSchema: cursor/touch position within the canvas bounds
 *
 * Reference: docs/rmhbox/design-spec/minigames-3.md §3.5
 */

import { z } from 'zod';
import { CU_CANVAS_WIDTH, CU_CANVAS_HEIGHT } from '../constants';

/** Validates a stone throw input: angle in radians and power 0–1. */
export const ThrowStoneSchema = z.object({
  angle: z.number().min(-Math.PI / 2).max(Math.PI / 2),
  power: z.number().min(0).max(1),
});

/** Validates a sweep input: cursor position within canvas bounds. */
export const SweepSchema = z.object({
  x: z.number().min(0).max(CU_CANVAS_WIDTH),
  y: z.number().min(0).max(CU_CANVAS_HEIGHT),
});

export type ThrowStoneInput = z.infer<typeof ThrowStoneSchema>;
export type SweepInput = z.infer<typeof SweepSchema>;
