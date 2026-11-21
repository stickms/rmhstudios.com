/**
 * Zod schemas for /api/achievements/tracked. Imported by the ROUTES only; the client reaches the same types through
 * `tracking.contract.ts` with `import type`, so zod never ships to the browser for these endpoints.
 */
import { z } from 'zod';

/** The caller's tracked set, plus what the list needs to sort by rarity. */
export const trackedState =
  z.object(
    {
      max: z
        .number()
        .int(),
      /** Achievement ids, oldest tracked first. */
      tracked:
        z.array(
          z.string(),
        ),
      /** Holder share (0 to 1) by achievement id. */
      rarity:
        z.record(
          z.string(),
          z.number(),
        ),
    },
  );
