/** Request shapes for "Your reports" (s03-16). Client-safe: zod and plain data only. */
import { z } from 'zod';
import { MY_REPORTS_FILTERS } from '@/lib/moderation/my-reports';

export const myReportsQuery = z.object({
  filter: z.enum(MY_REPORTS_FILTERS).optional(),
  cursor: z.string().min(1).max(64).optional(),
});
