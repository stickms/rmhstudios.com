import { z } from 'zod';

/** PUT /api/rmhtube/stats/pause */
export const setStatsPausedBody = z.object({
  paused: z.boolean(),
});
