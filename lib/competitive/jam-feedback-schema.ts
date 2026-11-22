/** Request schemas for the jam feedback endpoints (zod; the contracts import their types only). */
import { z } from 'zod';
import { FEEDBACK_MAX } from '@/lib/competitive/jam-feedback';

/**
 * The optional feedback fields of a rating. `feedback` is the raw text (the server trims it and checks the
 * minimum, so an empty box withdraws feedback); `anonymous` is "Leave my name off".
 */
export const feedbackFields = {
  feedback: z
    .string()
    .max(FEEDBACK_MAX + 200)
    .optional(),
  anonymous: z.boolean().optional(),
};

export const feedbackIdParams = z.object({ id: z.string().min(1).max(64) });
