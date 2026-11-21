/**
 * Zod schema for GET /api/analytics/audience. Imported by the route only; the client reaches
 * the type through `audience.contract.ts` with `import type`.
 */
import { z } from 'zod';

export const audienceQuery = z.object({
  range: z.enum(['30', '90', '365']).optional(),
  tz: z.string().min(1).max(64).optional(),
});
