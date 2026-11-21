/** Request schemas for the co-host endpoints (zod; the contracts import their types only). */
import { z } from 'zod';

export const inviteCohostBody = z.object({ userId: z.string().min(1).max(64) });

export const removeCohostQuery = z.object({ userId: z.string().min(1).max(64) });

export const respondCohostBody = z.object({ accept: z.boolean() });
