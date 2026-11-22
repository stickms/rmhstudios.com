/** Request schemas for the jam team endpoints (zod; the contracts import their types only). */
import { z } from 'zod';

export const inviteTeammateBody = z.object({ userId: z.string().min(1).max(64) });

export const removeTeammateQuery = z.object({ userId: z.string().min(1).max(64) });

export const respondTeamBody = z.object({ accept: z.boolean() });
