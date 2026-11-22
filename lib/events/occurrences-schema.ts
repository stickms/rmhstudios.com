/** Request schemas for changing one date of a repeating event (zod; the contract imports types only). */
import { z } from 'zod';
import { NOTE_MAX } from '@/lib/events/occurrences';

const instant = z.string().datetime({
  offset: true,
});

export const setOccurrenceBody = z
  .object({
    occurrenceAt: instant,
    kind: z.enum(['skip', 'move']),
    startsAt: instant.optional(),
    endsAt: instant.nullish(),
    note: z.string().trim().max(NOTE_MAX).nullish(),
  })
  .refine((b) => b.kind === 'skip' || !!b.startsAt, {
    message: 'A move needs a new start',
    path: ['startsAt'],
  });

export const restoreOccurrenceQuery = z.object({
  occurrenceAt: instant,
});
