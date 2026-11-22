/** Contracts for the grouped moderation queue (s03-20). Client-safe: types only. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { AdminQueueUser } from '@/lib/admin/admin-ops.contract';
import type { GroupReliability, ReasonCount, ReporterTally } from '@/lib/moderation/triage';
import type { decideGroupsBody, triageQuery } from '@/lib/moderation/triage-schema';

export interface GroupReportRow {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  /** The reporter took it back before anyone picked it up. */
  withdrawn: boolean;
  createdAt: string;
  reporter: AdminQueueUser;
  /** The reporter's upheld record; null below five decided reports in the last 180 days. */
  reporterRecord: ReporterTally | null;
}

export interface ReportGroupRow {
  entityType: string;
  entityId: string;
  count: number;
  reasons: ReasonCount[];
  firstAt: string;
  lastAt: string;
  /** A snippet of the reported post or reply; null for kinds with nothing safe to show. */
  preview: string | null;
  targetUser: AdminQueueUser | null;
  /** s03-04: moderator notes on the reported member (0 when there is no member). */
  targetNoteCount: number;
  reliability: GroupReliability;
  /** The newest reports of the group, at most 50. */
  reports: GroupReportRow[];
}

export interface ReportGroupsPage {
  groups: ReportGroupRow[];
  nextCursor: string | null;
  /** Groups matching the filters, across every page. */
  totalGroups: number;
  /** Reports per status, unfiltered (the tabs). */
  counts: Record<string, number>;
}

/** Open reports grouped by target, filtered and ordered as asked. */
export const listReportGroupsApi = endpoint<{
  query: z.infer<typeof triageQuery>;
  res: ReportGroupsPage;
}>()({
  method: 'GET',
  path: '/api/admin/reports/groups',
});

export interface DecideGroupsResult {
  success: true;
  /** Reports decided now. */
  decided: number;
  /** Reports another moderator had decided in the meantime, or that were no longer open. */
  skipped: number;
  /** Groups whose content could not be taken down; their reports stay open. */
  takedownFailed: number;
}

/** Resolve or dismiss every open report of the listed targets (takedown and message: one target only). */
export const decideReportGroupsApi = endpoint<{
  body: z.infer<typeof decideGroupsBody>;
  res: DecideGroupsResult;
}>()({
  method: 'POST',
  path: '/api/admin/reports/groups/decide',
});
