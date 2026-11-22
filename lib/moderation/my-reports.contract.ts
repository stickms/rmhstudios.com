/** Contracts for "Your reports" (s03-16). Client-safe: types only. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { ReportReason } from '@/lib/moderation/report-schema';
import type { ReportTarget, ReporterStatus } from '@/lib/moderation/my-reports';
import type { myReportsQuery } from '@/lib/moderation/my-reports-schema';

/** One report as its reporter sees it: no moderator, note, macro text or action. */
export interface MyReport {
  id: string;
  reason: ReportReason;
  createdAt: string;
  status: ReporterStatus;
  canWithdraw: boolean;
  target: ReportTarget;
}

export interface MyReportsPage {
  items: MyReport[];
  nextCursor: string | null;
}

/** The caller's own reports of the last 180 days, newest first, 20 a page. */
export const listMyReportsApi = endpoint<{
  query: z.infer<typeof myReportsQuery>;
  res: MyReportsPage;
}>()({ method: 'GET', path: '/api/account/reports' });

/** Take back a report nobody has picked up yet (404 for anyone else's, 409 once it moved on). */
export const withdrawReportApi = endpoint<{
  res: { success: true };
}>()({ method: 'POST', path: '/api/account/reports/$id/withdraw' });
