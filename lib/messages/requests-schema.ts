/**
 * Zod schemas for the message-request routes. Imported by the ROUTES only; the
 * client reaches the types through `requests.contract.ts` with `import type`.
 */
import { z } from 'zod';

export const decideRequestBody = z.object({
  action: z.enum(['accept', 'decline']),
});

export const listRequestsQuery = z.object({
  cursor: z.string().min(1).max(64).optional(),
});
