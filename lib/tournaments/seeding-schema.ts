import { z } from 'zod';
import { MAX_TOURNAMENT_PLAYERS } from '@/lib/wager/constants';
import { SEEDING_METHODS } from './seeding';

export const seedingMethodSchema = z.enum(SEEDING_METHODS);

/**
 * Host change to a tournament's seeding while registration is open: the
 * method, the hand order (entrant ids, first seed first; anyone left out is
 * appended in sign-up order), or both.
 */
export const updateSeedingSchema = z
  .object({
    method: seedingMethodSchema.optional(),
    order: z.array(z.string().min(1).max(64)).max(MAX_TOURNAMENT_PLAYERS).optional(),
  })
  .refine((v) => v.method !== undefined || v.order !== undefined, {
    message: 'Send a method or an order',
  })
  .refine((v) => !v.order || new Set(v.order).size === v.order.length, {
    message: 'An entrant appears twice in the order',
    path: ['order'],
  });
export type UpdateSeedingInput = z.infer<typeof updateSeedingSchema>;
