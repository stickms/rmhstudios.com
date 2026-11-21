/** AI personas — the zod request schema for POST /api/personas (client-safe). */
import { z } from 'zod';

export const createPersonaBody = z.object({
  name: z.string().min(2).max(40),
  tagline: z.string().max(120).optional(),
  systemPrompt: z.string().min(10).max(2000),
  greeting: z.string().max(500).optional(),
  emoji: z.string().max(8).optional(),
  isPublic: z.boolean().optional(),
});
