/** Request schema for POST /api/vega/score. Client-safe. */
import { z } from 'zod';

// Bounded, strict schema — the old `typeof number` check let a client submit
// Number.MAX_SAFE_INTEGER as a permanent top leaderboard entry.
export const vegaScoreBody =
  z
    .object(
      {
        highestLoop:
          z
            .number()
            .int()
            .min(
              0,
            )
            .max(
              100_000,
            ),
        highestLevel:
          z
            .number()
            .int()
            .min(
              0,
            )
            .max(
              100_000,
            ),
      },
    )
    .strict();
