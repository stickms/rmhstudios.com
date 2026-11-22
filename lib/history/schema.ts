/**
 * History & resume — the zod schema for the /api/history/beat heartbeat.
 * Split from `./constants`, which the history page and the resume prompts
 * import, so they stay zod-free.
 */
import { z } from 'zod';

import { HISTORY_ENTITY_TYPES } from './constants';

// Media positions are seconds; a generous cap avoids storing junk.
const MAX_POSITION = 60 * 60 * 48; // 48h

export const historyBeatSchema = z
  .object({
    entityType: z.enum(HISTORY_ENTITY_TYPES),
    entityId: z.string().min(1).max(64),
    position: z.number().int().min(0).max(MAX_POSITION).optional(),
    duration: z.number().int().min(0).max(MAX_POSITION).optional(),
  })
  .refine((v) => v.duration == null || v.position == null || v.position <= v.duration, {
    message: 'position exceeds duration',
  });

export type HistoryBeatInput = z.infer<typeof historyBeatSchema>;
