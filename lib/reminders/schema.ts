import { z } from 'zod';

import { REMINDER_KINDS, isSiteRelativePath } from './shared';

/**
 * "Remind me about this" (plan U7) — the zod schema for `POST /api/reminders`.
 * The rest of the contract is in `./shared` (re-exported here for the route
 * and the server module); client code imports `./shared` directly.
 */

export * from './shared';

export const createReminderSchema = z.object({
  kind: z.enum(REMINDER_KINDS),
  targetId: z.string().min(1).max(128),
  label: z.string().trim().min(1).max(140),
  url: z.string().refine(isSiteRelativePath, 'url must be a same-site path'),
  note: z.string().trim().max(140).optional(),
  /** Absolute instant (ISO). Presets resolve in the viewer's timezone client-side. */
  remindAt: z.string().datetime({ offset: true }),
});
export type CreateReminderInput = z.infer<typeof createReminderSchema>;
