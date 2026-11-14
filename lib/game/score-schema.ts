/** Request schemas for per-game score routes. Client-safe. */
import { z } from 'zod';

/**
 * Neon Driftway posts a loose payload: only `score` must be a number; every other
 * field is read defensively by the route (`typeof x === 'number'`), so they stay
 * `unknown` here to keep the route's old acceptance exactly.
 */
export const neonDriftwayScoreBody =
  z.object(
    {
      score:
        z.number(),
      username:
        z
          .unknown()
          .optional(),
      distance:
        z
          .unknown()
          .optional(),
      timeMs:
        z
          .unknown()
          .optional(),
      level:
        z
          .unknown()
          .optional(),
    },
  );

/**
 * Void Breaker posts a loose payload: only `score` must be a number; the route reads
 * every other field defensively (`typeof x === 'number'`), so they stay `unknown`.
 */
export const voidBreakerScoreBody =
  z.object(
    {
      score:
        z.number(),
      username:
        z
          .unknown()
          .optional(),
      wave: z
        .unknown()
        .optional(),
      timeMs:
        z
          .unknown()
          .optional(),
    },
  );

/** Body of the shared POST /api/games/$id/score. */
export const gameScoreBody =
  z.object(
    {
      score:
        z
          .number()
          .finite(),
      /** Secondary metric: wave, floor, distance, combo — game-dependent. */
      progress:
        z
          .number()
          .finite()
          .optional(),
      /** Run duration in ms; enables the score-rate plausibility check. */
      durationMs:
        z
          .number()
          .finite()
          .nonnegative()
          .optional(),
      username:
        z
          .string()
          .max(
            64,
          )
          .optional(),
      /** Game-specific numeric extras; unknown keys are ignored by the adapter. */
      meta: z
        .record(
          z.string(),
          z
            .number()
            .finite(),
        )
        .optional(),
    },
  );
