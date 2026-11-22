import { z } from 'zod';

/** Which sweep an admin action is about: the `Media` rows, or the pronunciation clips. */
export const sweepKindBody = z.object({ kind: z.enum(['media', 'clips']) });
