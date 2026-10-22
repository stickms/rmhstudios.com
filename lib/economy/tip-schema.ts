/**
 * The coin-tip contract, shared by the API route and the tip dialog.
 *
 * Same duplication as `lib/moderation/report-schema.ts`: `app/routes/api/
 * coins/tip.ts` declared `note: z.string().max(280)` and
 * `components/economy/TipDialog.tsx` declared `maxLength={280}`, and the two
 * `280`s had no relationship other than someone having typed both. The
 * `entityType` union was written twice as well.
 *
 * Client-safe: zod and constants only, no `.server` imports. The constants
 * live in `./tip-limits` (re-exported here) so callers that need only a
 * number stay zod-free; the dialog itself is lazy-loaded wherever it mounts.
 */

import { z } from 'zod';

import { TIP_ENTITY_TYPES, TIP_MAX, TIP_MIN, TIP_NOTE_MAX } from './tip-limits';

export { TIP_ENTITY_TYPES, TIP_MAX, TIP_MIN, TIP_NOTE_MAX };
export type { TipEntityType } from './tip-limits';

export const tipSchema = z.object({
  recipientId: z.string().min(1).max(64),
  amount: z.number().int().min(TIP_MIN).max(TIP_MAX),
  note: z.string().max(TIP_NOTE_MAX).optional(),
  entityType: z.enum(TIP_ENTITY_TYPES).optional(),
  entityId: z.string().max(64).optional(),
});

export type TipInput = z.infer<typeof tipSchema>;
