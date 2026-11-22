/**
 * Validation for GET /api/rmhladder/insights (sprint 03, feature 18). Both
 * parameters are single values; the quiet window is one of three presets.
 */
import { z } from 'zod';

export const INSIGHT_RANGES = ['90d', '1y', 'all'] as const;
export type InsightRange = (typeof INSIGHT_RANGES)[number];

export const QUIET_DAY_CHOICES = ['14', '21', '30'] as const;

export const insightsQuery = z.object({
  range: z.enum(INSIGHT_RANGES).optional(),
  quietDays: z.enum(QUIET_DAY_CHOICES).optional(),
});
