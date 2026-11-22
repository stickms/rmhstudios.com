/**
 * Zod schema for GET /api/study/stats. Imported by the route only; the client reaches the
 * type through `stats.contract.ts` with `import type`.
 */
import { z } from 'zod';

export const statsQuery = z.object({
  deckId: z.string().min(1).max(64).optional(),
  tz: z.string().min(1).max(64).optional(),
});
