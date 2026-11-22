import { z } from 'zod';

/** Body of `POST /api/rmharks/$id/pin/move`. */
export const movePinBodySchema = z.object({
  direction: z.enum(['up', 'down']),
});
