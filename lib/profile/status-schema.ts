/**
 * Custom status — the zod schema for `PUT /api/profile/status`. Split from
 * `./status`, which the profile page and the status editor import.
 */
import { z } from 'zod';

import { STATUS_MAX_EMOJI, STATUS_MAX_TEXT } from './status';

/** PUT body for `/api/profile/status`. A full replace of the status. */
export const statusUpdateSchema = z.object({
  emoji: z.string().max(STATUS_MAX_EMOJI).nullable().optional(),
  text: z.string().max(STATUS_MAX_TEXT).nullable().optional(),
  expiresIn: z.enum(['30m', '1h', 'today']).nullable().optional(),
  auto: z.boolean().optional(),
});

export type StatusUpdateInput = z.infer<typeof statusUpdateSchema>;
