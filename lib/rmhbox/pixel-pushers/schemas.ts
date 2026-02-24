/**
 * Pixel Pushers — Zod Validation Schemas
 *
 * Validates client inputs (move directions) and
 * server-side level data structures at startup.
 *
 * Reference: docs/rmhbox/design-spec/minigames-4.md §3.5
 */

import { z } from 'zod';

/** Validates a movement input from the client. dx/dy are normalized direction values. */
export const PPMoveSchema = z.object({
  dx: z.number().min(-1).max(1),
  dy: z.number().min(-1).max(1),
});

/** Validates a level definition loaded from levels.json. */
export const PPLevelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  walls: z.array(z.object({
    x: z.number(), y: z.number(),
    width: z.number().positive(), height: z.number().positive(),
  })),
  ballStart: z.object({ x: z.number(), y: z.number() }),
  goalZone: z.object({
    x: z.number(), y: z.number(),
    width: z.number().positive(), height: z.number().positive(),
  }),
  waypoints: z.array(z.object({
    x: z.number(), y: z.number(), order: z.number().int().positive(),
  })),
  playerStartPositions: z.array(z.object({ x: z.number(), y: z.number() })).min(2),
  difficulty: z.enum(['easy', 'medium', 'hard']),
});

export type PPLevel = z.infer<typeof PPLevelSchema>;
export type PPMoveInput = z.infer<typeof PPMoveSchema>;
