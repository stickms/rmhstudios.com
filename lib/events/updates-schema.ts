/** Request schemas for event updates (zod; the contract imports types only). */
import { z } from 'zod';
import { UPDATE_MAX } from '@/lib/events/updates';

const instant = z.string().datetime({ offset: true });

export const postUpdateBody = z.object({
  body: z.string().trim().min(1).max(UPDATE_MAX),
  /**
   * The date a repeating event's update is about (its original start). Omitted: the next date. `null`: the
   * whole series. A one-off event ignores it.
   */
  occurrenceAt: instant.nullish(),
});

export const recipientsQuery = z.object({
  occurrenceAt: z.union([instant, z.literal('series')]).optional(),
});
