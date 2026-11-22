/** Zod schemas for the RMHType ghost endpoints and the solo finish payload. */
import { z } from 'zod';
import { MAX_GHOST_SAMPLES } from '@/lib/rmhtype/ghost';

export const ghostParams = z.object({
  passageId: z.string().min(1).max(80),
});

/** `samples` on the solo finish event: whole numbers, bounded; plausibility is checked against the run. */
export const ghostSamplesSchema = z.array(z.number().int().min(0)).min(1).max(MAX_GHOST_SAMPLES);
