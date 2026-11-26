/**
 * Contracts for puzzle reports (sprint 14, feature 06). Client-safe: types come from the schemas by `import type`.
 * No response of the member-facing endpoint carries a puzzle or its answer; the admin responses carry the answer
 * as plain text and are admin only.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { DailyPuzzleMode } from '@/lib/daily-puzzles/generate-core';
import type { DayRelation, ReportKind, ReviewOutcome } from '@/lib/daily-puzzles/reports';
import type {
  adminPuzzlesQuery,
  fileReportBody,
  generatePuzzleBody,
  replacePuzzleBody,
  reviewReportsBody,
} from '@/lib/daily-puzzles/reports-schema';

/** What the team concluded about a day's reports (s15-07). */
export interface ReportReview {
  outcome: ReviewOutcome;
  /** The admin's note to the reporters; null when there is none. */
  note: string | null;
}

/**
 * Say what is wrong with a puzzle the member has finished. Sending again replaces the kind and the note. When the
 * day was already reviewed the answer also carries the outcome (and the new report is stored already reviewed).
 */
export const fileReportApi = endpoint<{
  body: z.infer<typeof fileReportBody>;
  res: { ok: true; review?: ReportReview };
}>()({ method: 'PUT', path: '/api/daily-puzzles/report' });

export interface AdminReportItem {
  id: string;
  /** The reporter's handle, for follow-up; null when they have none. */
  handle: string | null;
  kind: ReportKind;
  note: string | null;
  at: string;
  /** ISO time an admin reviewed it; null while it is open. */
  reviewedAt: string | null;
}

export interface AdminPuzzleRow {
  id: string;
  /** ISO time the row was written; sent back with a replace so a changed row is noticed. */
  createdAt: string;
  /** `deepseek` (the model) or `fallback`. */
  source: string;
  puzzleText: string;
  answerText: string;
}

export interface AdminPuzzleDay {
  dateKey: string;
  relation: DayRelation;
  /** Null when nothing has generated this day yet. */
  puzzle: AdminPuzzleRow | null;
  scoreCount: number;
  /** A future day inside the window and the margin with no score: the page offers "Replace". */
  replaceable: boolean;
  /** A future day inside the window with no row: the page offers "Generate now". */
  generatable: boolean;
  reportCounts: Record<ReportKind, number>;
  reports: AdminReportItem[];
  /** Reports of the day nobody has reviewed yet: "Mark reviewed" is offered when this is above zero. */
  openReportCount: number;
  /** The day's latest review, or null when none has happened. */
  review: ReportReview | null;
}

export interface AdminPuzzles {
  mode: DailyPuzzleMode;
  today: string;
  days: AdminPuzzleDay[];
}

/** Today's, the next two days' and the last seven days' puzzles for one mode, with answers and reports. */
export const getAdminPuzzlesApi = endpoint<{
  query: z.infer<typeof adminPuzzlesQuery>;
  res: AdminPuzzles;
}>()({ method: 'GET', path: '/api/admin/daily-puzzles' });

/** Replace one of the next two days' puzzles in place. Refused once the day has started or anyone has a score. */
export const replacePuzzleApi = endpoint<{
  body: z.infer<typeof replacePuzzleBody>;
  res: { ok: true; source: string };
}>()({ method: 'POST', path: '/api/admin/daily-puzzles/replace' });

/** Create a missing row for one of the next two days; never replaces an existing one. */
export const generatePuzzleApi = endpoint<{
  body: z.infer<typeof generatePuzzleBody>;
  res: { created: boolean; source: string };
}>()({ method: 'POST', path: '/api/admin/daily-puzzles/generate' });

/**
 * Mark a mode-day's open reports reviewed with one outcome and an optional note, telling each reporter once. A second
 * review of the same day changes nothing and sends nothing. The puzzle and the scores are never touched.
 */
export const reviewReportsApi = endpoint<{
  body: z.infer<typeof reviewReportsBody>;
  res: { ok: true; reviewed: number };
}>()({ method: 'POST', path: '/api/admin/daily-puzzles/review' });
