/**
 * The coin-tip contract, shared by the API route and the tip dialog.
 *
 * Same duplication as `lib/moderation/report-schema.ts`: `app/routes/api/
 * coins/tip.ts` declared `note: z.string().max(280)` and
 * `components/economy/TipDialog.tsx` declared `maxLength={280}`, and the two
 * `280`s had no relationship other than someone having typed both. The
 * `entityType` union was written twice as well.
 *
 * Client-safe: zod and constants only, no `.server` imports.
 */

import { z } from 'zod';

/** Smallest tip. A tip of zero is a no-op that still writes a ledger row. */
export const TIP_MIN = 1;
/**
 * Largest single tip. Not a balance check — `transferCoins` enforces that
 * atomically inside the UPDATE — just a bound on one transaction, so a slipped
 * decimal point cannot move an entire balance in one click.
 */
export const TIP_MAX = 100_000;
/** Optional note cap. The textarea's `maxLength` reads this, not a literal. */
export const TIP_NOTE_MAX = 280;

/** What a tip can be attached to, for the "tipped your post" notification. */
export const TIP_ENTITY_TYPES = ['rmhark', 'profile'] as const;
export type TipEntityType = (typeof TIP_ENTITY_TYPES)[number];

export const tipSchema = z.object({
  recipientId: z.string().min(1).max(64),
  amount: z.number().int().min(TIP_MIN).max(TIP_MAX),
  note: z.string().max(TIP_NOTE_MAX).optional(),
  entityType: z.enum(TIP_ENTITY_TYPES).optional(),
  entityId: z.string().max(64).optional(),
});

export type TipInput = z.infer<typeof tipSchema>;
