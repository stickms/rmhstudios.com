/** Zod for /api/admin/sweeps (server side; the client sees only the types, by `import type`). */
import { z } from 'zod';
import { SWEEP_REASON_MAX, SWEEP_REASON_MIN } from '@/lib/admin/sweeps';

/** An ISO date-time string; the server turns it into a Date. */
const isoDate = z
  .string()
  .max(40)
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Not a date');

/** Preview a sweep: nothing changes until it is confirmed. */
export const createSweepBody = z
  .object({
    subjectId: z.string().trim().min(1).max(40),
    from: isoDate.optional(),
    to: isoDate.optional(),
    includePosts: z.boolean().default(true),
    includeReplies: z.boolean().default(true),
    reason: z.string().trim().min(SWEEP_REASON_MIN).max(SWEEP_REASON_MAX),
    strike: z.boolean().default(false),
  })
  .refine((b) => b.includePosts || b.includeReplies, {
    message: 'Choose posts, replies or both',
    path: ['includePosts'],
  });

/** One value each: repeated parameters do not survive. */
export const listSweepsQuery = z.object({
  subject: z.string().trim().min(1).max(40).optional(),
});
