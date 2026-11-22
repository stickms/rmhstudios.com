/**
 * The content-report contract, shared by the API route and the dialog.
 *
 * ## Why this file exists
 *
 * The reason list and the details length limit were written twice: once as a
 * `z.enum([...])` inside `lib/moderation/api/moderation.report.server.ts`, and once as a
 * hand-typed array of nine `{ value, label }` objects in
 * `components/moderation/ReportDialog.tsx`, plus a `maxLength={1000}` that
 * happened to match the route's `.max(1000)`.
 *
 * Two copies of a validation rule is one copy of a bug: adding a tenth reason
 * server-side leaves the dialog unable to offer it, and removing one leaves the
 * dialog offering an option every submission 400s on. Neither shows up in
 * review, and neither shows up in types — because the route file cannot be
 * imported by a component (it pulls in Prisma), which is exactly why the
 * duplicate was written in the first place.
 *
 * This module is deliberately **client-safe**: zod and plain data only, no
 * `.server` imports, so both sides import the same declaration.
 */

import { z } from 'zod';

export {
  REMOVABLE_REPORT_ENTITY_TYPES,
  REPORT_ENTITY_TYPES,
  REPORT_REASONS,
  type ReportEntityType,
  type ReportReason,
} from '@/lib/moderation/report-constants';
import { REPORT_ENTITY_TYPES, REPORT_REASONS } from '@/lib/moderation/report-constants';

/** Free-text detail cap. The textarea's `maxLength` reads this, not a literal. */
export const REPORT_DETAILS_MAX = 1000;

export const reportSchema = z.object({
  entityType: z.enum(REPORT_ENTITY_TYPES),
  entityId: z.string().min(1).max(64),
  reason: z.enum(REPORT_REASONS),
  details: z.string().max(REPORT_DETAILS_MAX).optional(),
});

export type ReportInput = z.infer<typeof reportSchema>;
