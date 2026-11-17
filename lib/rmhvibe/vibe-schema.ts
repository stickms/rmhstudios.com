/**
 * RMHVibe — request schemas. Server-imported only (client code must not ship zod).
 */

import { z } from 'zod';

export const vibeStreamBodySchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  slug: z.string().max(64).optional(),
  fromVersionId: z.string().max(40).optional(),
  model: z.string().optional(),
  kind: z.enum(['page', 'widget']).optional(),
});

export type VibeStreamBody = z.infer<typeof vibeStreamBodySchema>;
