/** zod for the community sanction endpoints (shared by the routes and `bans.contract.ts`). */
import { z } from 'zod';
import { SANCTION_DURATIONS, SANCTION_KINDS, SANCTION_REASON_MAX, isDurationAllowed } from '@/lib/communities/bans';

export const createSanctionBody = z
  .object({
    userId: z.string().min(1).max(64),
    kind: z.enum(SANCTION_KINDS),
    duration: z.enum(SANCTION_DURATIONS),
    ruleId: z.string().min(1).max(64).optional(),
    reason: z.string().trim().max(SANCTION_REASON_MAX).optional(),
  })
  .refine((b) => isDurationAllowed(b.kind, b.duration), {
    message: 'That duration is not available for this kind',
    path: ['duration'],
  });

export const listSanctionsQuery = z.object({
  status: z.enum(['active', 'past']).optional(),
});
