/** Request schemas for per-game score routes. Client-safe. */
import { z } from 'zod';

/**
 * Neon Driftway posts a loose payload: only `score` must be a number; every other
 * field is read defensively by the route (`typeof x === 'number'`), so they stay
 * `unknown` here to keep the route's old acceptance exactly.
 */
export const neonDriftwayScoreBody = z.object({
  score: z.number(),
  username: z.unknown().optional(),
  distance: z.unknown().optional(),
  timeMs: z.unknown().optional(),
  level: z.unknown().optional(),
});
