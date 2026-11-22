/**
 * Zod schema for `GET /api/achievements/compare`. Imported by the route only; the client reaches the same types through
 * `compare.contract.ts` with `import type`, so zod never ships to the browser for this endpoint.
 */
import { z } from 'zod';
import { HANDLE_OR_ID } from '@/lib/achievements/compare';

export const compareQuery = z.object({
  with: z.string().trim().regex(HANDLE_OR_ID),
});
