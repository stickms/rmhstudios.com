/**
 * RMHVibe — request schemas. Server-imported only (client code must not ship zod).
 */

import { z } from 'zod';

export const vibeSelectionSchema = z.object({
  tag: z.string().min(1).max(32),
  text: z.string().max(120),
  html: z.string().max(600),
  path: z.string().max(200),
});

export const vibeStreamBodySchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  slug: z.string().max(64).optional(),
  fromVersionId: z.string().max(40).optional(),
  model: z.string().optional(),
  kind: z.enum(['page', 'widget']).optional(),
  selection: vibeSelectionSchema.optional(),
});

export type VibeStreamBody = z.infer<typeof vibeStreamBodySchema>;

export const vibeTweaksBodySchema = z.object({
  // Entries are validated against the page's spec, not here.
  values: z.record(z.string().max(64), z.unknown()),
});
