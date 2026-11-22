/** Request shapes for the grouped moderation queue (s03-20). Client-safe: zod and plain data only. */
import { z } from 'zod';
import { REPORT_ENTITY_TYPES } from '@/lib/moderation/report-schema';

export {
  GROUPS_PAGE_SIZE,
  MAX_COUNTED_GROUPS,
  MAX_DECIDE_GROUPS,
  MAX_DECIDE_REPORTS,
  MAX_REPORTS_PER_GROUP_SHOWN,
  TRIAGE_SORTS,
  TRIAGE_STATUSES,
  type TriageSort,
  type TriageStatus,
} from '@/lib/moderation/triage-constants';
import { MAX_DECIDE_GROUPS, TRIAGE_SORTS, TRIAGE_STATUSES } from '@/lib/moderation/triage-constants';

/**
 * The grouped queue's filters, as they arrive on the wire. A list is one comma-separated parameter (repeated
 * parameters do not survive the contract client), and numbers are digits in a string; `parseTriageFilters` in
 * `triage.ts` turns them into values.
 */
export const triageQuery = z.object({
  status: z.enum(TRIAGE_STATUSES).optional(),
  reasons: z.string().max(200).optional(),
  entityType: z.enum(REPORT_ENTITY_TYPES).optional(),
  min: z
    .string()
    .regex(/^\d{1,4}$/)
    .optional(),
  sort: z.enum(TRIAGE_SORTS).optional(),
  cursor: z
    .string()
    .regex(/^\d{1,6}$/)
    .optional(),
});

export const decideGroupsBody = z.object({
  targets: z
    .array(
      z.object({
        entityType: z.enum(REPORT_ENTITY_TYPES),
        entityId: z.string().min(1).max(64),
      }),
    )
    .min(1)
    .max(MAX_DECIDE_GROUPS),
  action: z.enum(['resolve', 'dismiss']),
  deleteContent: z.boolean().optional(),
  message: z.string().trim().max(1000).optional(),
});
