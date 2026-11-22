/** Query schema for the community insights endpoint (shared by the route and `insights.contract.ts`). */
import { z } from 'zod';
import { isValidTimeZone } from '@/lib/calendar/tz';

export const insightsQuery = z.object({
  /** Days in the range; one of 28, 90 or 365 (default 28). */
  range: z.enum(['28', '90', '365']).optional(),
  /** The moderator's IANA time zone, for the hour grid (default UTC). */
  tz: z.string().max(64).refine(isValidTimeZone, 'Unknown time zone').optional(),
});
