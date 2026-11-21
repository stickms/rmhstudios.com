/** Query schema for the moderation log endpoints (shared by the route and `modlog.contract.ts`). */
import { z } from 'zod';
import { MOD_LOG_GROUPS } from '@/lib/communities/modlog';

export const modLogQuery = z.object({
  /** `public` is the member-safe subset; `full` is moderators only. Default `full`. */
  scope: z.enum(['public', 'full']).optional(),
  group: z.enum(MOD_LOG_GROUPS).optional(),
  /** A moderator's user id. */
  actor: z.string().min(1).max(64).optional(),
  /** The `nextCursor` of the previous page. */
  cursor: z
    .string()
    .regex(/^\d{1,18}$/)
    .optional(),
});
