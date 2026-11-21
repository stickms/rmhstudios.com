/**
 * Personal best history (sprint 05 #04) — the response shape of `/api/games/$id/personal-bests`.
 * Split from the contract so client code that only draws the section does not bring zod along.
 */
import { z } from 'zod';

/** Rows kept per (member, game); the oldest beyond this are pruned when a new one is written. */
export const PERSONAL_BEST_KEEP = 100;

export const personalBestRowSchema =
  z.object(
    {
      /** The row id as a string (a BigInt does not survive JSON). */
      id: z.string(),
      score:
        z
          .number()
          .int(),
      /** The best before this run; null for the first score. */
      previous:
        z
          .number()
          .int()
          .nullable(),
      progress:
        z
          .number()
          .int()
          .nullable(),
      /** ISO time the record was set. */
      at: z.string(),
    },
  );

export const personalBestsSchema =
  z.object(
    {
      /** Whether a lower score is better; such a game's scores are durations in milliseconds. */
      lowerIsBetter:
        z.boolean(),
      /** Newest first, at most {@link PERSONAL_BEST_KEEP}. */
      rows: z.array(
        personalBestRowSchema,
      ),
    },
  );

export const clearedPersonalBestsSchema =
  z.object(
    {
      cleared:
        z
          .number()
          .int(),
    },
  );
