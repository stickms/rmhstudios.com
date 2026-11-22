/** Query schema for the build insights endpoint (shared by the route and `insights.contract.ts`). */
import { z } from 'zod';

export const buildInsightsQuery = z.object({
  /** Days in the range: 7, 30 or 90 (default 30). */
  range: z.enum(['7', '30', '90']).optional(),
});
