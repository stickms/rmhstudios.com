/**
 * Your reports (s03-16): what a reporter is told about a report they filed.
 *
 * Pure and client-safe. The reporter sees one of five states and, once a report is decided, one of two outcomes.
 * Nothing about WHO decided or WHAT was done leaves the server: a removal, a strike or a ban is the reported
 * member's business, so `RESOLVED` is only ever "Action taken" and `DISMISSED` only "No violation found".
 */

import type { ReportEntityType } from '@/lib/moderation/report-schema';

/** How long a member can look back at the reports they made. */
export const MY_REPORTS_WINDOW_DAYS = 180;
export const MY_REPORTS_PAGE_SIZE = 20;

/** The database statuses, as `ContentReport.status` holds them. */
export type StoredReportStatus = 'PENDING' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';

/** What the reporter sees. `WITHDRAWN` is a `DISMISSED` row that carries `withdrawnAt`. */
export type ReporterStatus = 'WAITING' | 'REVIEWING' | 'ACTION_TAKEN' | 'NO_VIOLATION' | 'WITHDRAWN';

/** The two outcomes a decided report is announced with. */
export type ReportOutcome = 'ACTION_TAKEN' | 'NO_VIOLATION';

export const MY_REPORTS_FILTERS = ['all', 'open', 'closed'] as const;
export type MyReportsFilter = (typeof MY_REPORTS_FILTERS)[number];

/** The `entityType` of the in-site notification; the inbox labels it "Safety" and links to the panel. */
export const REPORT_OUTCOME_ENTITY_TYPE = 'report_outcome';
/** Where the notification points: the Security page, whose "Your reports" panel lists the report. */
export const MY_REPORTS_LINK = '/settings/security#your-reports';

export function reporterStatus(row: {
  status: StoredReportStatus;
  withdrawnAt: Date | string | null;
}): ReporterStatus {
  switch (row.status) {
    case 'PENDING':
      return 'WAITING';
    case 'REVIEWING':
      return 'REVIEWING';
    case 'RESOLVED':
      return 'ACTION_TAKEN';
    case 'DISMISSED':
      return row.withdrawnAt ? 'WITHDRAWN' : 'NO_VIOLATION';
  }
}

/** A report is open until it is decided or withdrawn. */
export function isOpenStatus(status: ReporterStatus): boolean {
  return status === 'WAITING' || status === 'REVIEWING';
}

/** Only a report nobody has picked up yet can be taken back. */
export function canWithdraw(status: ReporterStatus): boolean {
  return status === 'WAITING';
}

/** The outcome to announce for a stored status, or null for one that is not a decision. */
export function outcomeOf(row: {
  status: StoredReportStatus;
  withdrawnAt: Date | string | null;
}): ReportOutcome | null {
  const status = reporterStatus(row);
  return status === 'ACTION_TAKEN' || status === 'NO_VIOLATION' ? status : null;
}

/** The notification text. Fixed English, like every stored notification preview; it never carries moderator text. */
export const OUTCOME_PREVIEW: Record<ReportOutcome, string> = {
  ACTION_TAKEN: 'Your report was reviewed: action taken',
  NO_VIOLATION: 'Your report was reviewed: no violation found',
};

/** The part of a row's `where` that selects a filter's reports (`all` selects every status). */
export function statusWhere(filter: MyReportsFilter): { status?: { in: StoredReportStatus[] } } {
  if (filter === 'open') return { status: { in: ['PENDING', 'REVIEWING'] } };
  if (filter === 'closed') return { status: { in: ['RESOLVED', 'DISMISSED'] } };
  return {};
}

/** The reported content as this viewer may see it now. */
export interface ReportTarget {
  kind: ReportEntityType;
  /**
   * False when the content is gone or the reporter can no longer see it: the panel then says it is no longer
   * available, with no text and no link.
   */
  available: boolean;
  /** A short name when it is available: the start of a post, a build's title, a handle. */
  name: string | null;
  /** A same-site path when it is available and addressable. */
  href: string | null;
}

/** Collapse whitespace and cut to `max` characters. */
export function snippet(text: string | null | undefined, max = 60): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** The target a report shows when nothing about the content may be shown. */
export function unavailableTarget(kind: ReportEntityType): ReportTarget {
  return { kind, available: false, name: null, href: null };
}

/** The first moment a report is outside the 180-day look-back. */
export function windowStart(now: Date): Date {
  return new Date(now.getTime() - MY_REPORTS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}
