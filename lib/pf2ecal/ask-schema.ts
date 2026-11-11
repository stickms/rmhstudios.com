/** Request schema for POST /api/pf2ecal/ask. Client-safe. */
import { z } from 'zod';

export const pf2ecalAskSchema = z.object({
  question: z.string().trim().min(1).max(500),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
      }),
    )
    .max(12)
    .default([]),
});
