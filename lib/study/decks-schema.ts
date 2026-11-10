/**
 * Zod schemas for the /api/study/decks routes. Imported by the ROUTES only; the
 * client reaches the same types through `decks.contract.ts` with `import type`.
 */
import { z } from 'zod';

export const createDeckBody = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
  // Optional AI seed: generate starter cards for this topic.
  generateTopic: z.string().max(200).optional(),
});

export const addCardBody = z.object({
  front: z.string().min(1).max(500),
  back: z.string().min(1).max(500),
});

export const reviewCardBody = z.object({ grade: z.number().int().min(0).max(3) });
