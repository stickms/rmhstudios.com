/**
 * P6 — the zod schemas for the webring API routes. Split from `./webrings`,
 * which the profile strip and the /rings page import for the limits and view
 * types, so they stay zod-free.
 */
import { z } from 'zod';

import { RING_DESCRIPTION_MAX, RING_NAME_MAX } from './webrings';

export const createRingSchema = z.object({
  name: z.string().trim().min(3).max(RING_NAME_MAX),
  description: z.string().trim().max(RING_DESCRIPTION_MAX).optional(),
});

export type CreateRingInput = z.infer<typeof createRingSchema>;

export const ringSlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/);
