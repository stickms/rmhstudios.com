import { z } from 'zod';
import { SECURITY_FILTERS } from '@/lib/auth/security-log';

export const securityActivityQuery = z.object({
  /** Id of the last row of the previous page (rows are newest first). */
  cursor: z.string().regex(/^\d{1,18}$/).optional(),
  filter: z.enum(SECURITY_FILTERS).optional(),
});
