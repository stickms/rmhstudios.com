/**
 * Puzzle reports and the admin's check of coming puzzles (sprint 14, feature 06). Server-only.
 *
 * A member who finished an AI daily puzzle can say it is wrong (`fileReport`, one row per member per puzzle, a second
 * send replaces the first). An admin sees the next days' puzzles with their answers and reports (`adminDays`), can
 * create a missing day early (`generateNow`) and can replace a day that has not started (`replaceFuturePuzzle`).
 *
 * The replace order is fixed so that a day that has started can never change: generate first (no lock, no row held
 * during the model call), then one transaction under a per-day advisory lock that re-checks the window, the margin,
 * the scores and the row the admin saw, updates that row in place and records the admin action. The row is never
 * deleted, so the unique `[gameMode, dateKey]` never has a gap in which another writer could store a different puzzle.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { recordAdminActionIn } from '@/lib/admin-audit.server';
import { createNotification } from '@/lib/notifications.server';
import { notice } from '@/lib/notifications/notice-keys';
import type { ErrorCode } from '@/lib/errors/codes';
import { isAIPuzzleMode, type DailyPuzzleMode } from '@/lib/daily-puzzles/generate-core';
import { generateForMode, getOrCreateDailyPuzzle } from '@/lib/daily-puzzles/generate.server';
import {
  adminDayKeys,
  describePuzzle,
  isAheadDay,
  isReportableDay,
  isReportKind,
  isReviewOutcome,
  puzzleDayOf,
  relationOf,
  replaceTiming,
  type ReportKind,
  type ReviewOutcome,
} from '@/lib/daily-puzzles/reports';
import type { AdminPuzzleDay, AdminPuzzles, AdminReportItem, ReportReview } from '@/lib/daily-puzzles/reports.contract';

export type ReportResult = { ok: true; review?: ReportReview } | { ok: false; code: ErrorCode };

/* ── A member's report ───────────────────────────────────────────────────────────────────────────────────────── */

export async function fileReport(
  userId: string,
  input: { gameMode: string; dateKey: string; kind: string; note?: string | undefined },
  nowMs: number = Date.now(),
): Promise<ReportResult> {
  const { gameMode, dateKey, kind } = input;
  if (!isAIPuzzleMode(gameMode) || !isReportKind(kind) || !isReportableDay(dateKey, puzzleDayOf(nowMs))) {
    return { ok: false, code: 'INVALID_INPUT' };
  }
  // Only a member who finished it: a score row for the mode and day. Never before, so the entry cannot hint.
  const played = await prisma.dailyPuzzleScore.findUnique({
    where: { userId_gameMode_dateKey: { userId, gameMode, dateKey } },
    select: { id: true },
  });
  if (!played) return { ok: false, code: 'PUZZLE_REPORT_NOT_PLAYED' };

  const note = input.note?.trim() ? input.note.trim() : null;
  // A day an admin has already reviewed: the new row is written reviewed, with the day's outcome and note, so it never
  // reopens the day and never earns a second notice (s15-07). The member is told the outcome at once.
  const review = await dayReview(gameMode, dateKey);
  const reviewedColumns = review
    ? { reviewedAt: review.reviewedAt, reviewOutcome: review.outcome, reviewNote: review.note }
    : {};
  // One upsert on the unique key, so two concurrent sends leave one row. A resend keeps whatever review the row has.
  await prisma.dailyPuzzleReport.upsert({
    where: { userId_gameMode_dateKey: { userId, gameMode, dateKey } },
    create: { userId, gameMode, dateKey, kind, note, ...reviewedColumns },
    update: { kind, note },
  });
  return review ? { ok: true, review: { outcome: review.outcome, note: review.note } } : { ok: true };
}

/** The latest review of a mode-day's reports, or null when none has happened. Uses `[gameMode, dateKey]`. */
async function dayReview(
  mode: string,
  dateKey: string,
): Promise<{ outcome: ReviewOutcome; note: string | null; reviewedAt: Date } | null> {
  const row = await prisma.dailyPuzzleReport.findFirst({
    where: { gameMode: mode, dateKey, reviewedAt: { not: null } },
    orderBy: { reviewedAt: 'desc' },
    select: { reviewedAt: true, reviewOutcome: true, reviewNote: true },
  });
  if (!row?.reviewedAt || !isReviewOutcome(row.reviewOutcome)) return null;
  return { outcome: row.reviewOutcome, note: row.reviewNote, reviewedAt: row.reviewedAt };
}

/* ── Review (s15-07) ─────────────────────────────────────────────────────────────────────────────────────────── */

/** Most open reports one review claims; the admin page lists at most 500 per mode, so this is the same bound. */
const REVIEW_CLAIM_CAP = 500;

/**
 * An admin marks a mode-day's open reports reviewed with one outcome and an optional note. In one transaction under the
 * day's lock each open report is claimed by a conditional `updateMany` (`reviewedAt: null`), so a second review claims
 * nothing, and one audit row records the day, mode, outcome and count. The reporters of the claimed rows (and only
 * those) are told once after the commit; a failed notice is logged and never undoes the review. The puzzle and the
 * scores are never read or written.
 */
export async function reviewReports(
  adminId: string,
  mode: DailyPuzzleMode,
  dateKey: string,
  outcome: ReviewOutcome,
  note?: string | null,
): Promise<{ ok: true; reviewed: number } | { ok: false; code: ErrorCode }> {
  if (!isAIPuzzleMode(mode) || !isReviewOutcome(outcome) || !isReportableDay(dateKey, puzzleDayOf(Date.now()))) {
    return { ok: false, code: 'INVALID_INPUT' };
  }
  const text = note?.trim() ? note.trim() : null;
  const claimed = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `daily-puzzle-report:${mode}:${dateKey}`);
    const open = await tx.dailyPuzzleReport.findMany({
      where: { gameMode: mode, dateKey, reviewedAt: null },
      orderBy: { createdAt: 'asc' },
      take: REVIEW_CLAIM_CAP,
      select: { id: true, userId: true },
    });
    const won: { id: string; userId: string }[] = [];
    const reviewedAt = new Date();
    for (const r of open) {
      const res = await tx.dailyPuzzleReport.updateMany({
        where: { id: r.id, reviewedAt: null },
        data: { reviewedAt, reviewOutcome: outcome, reviewNote: text },
      });
      if (res.count === 1) won.push(r);
    }
    if (won.length > 0) {
      await recordAdminActionIn(tx, adminId, 'daily-puzzle-report-review', {
        targetType: 'daily_puzzle',
        targetId: `${mode}:${dateKey}`,
        detail: `${mode} ${dateKey}: ${outcome}, ${won.length} reports`,
      });
    }
    return won;
  });

  const link = `/daily/${mode}`;
  for (const r of claimed) {
    try {
      await createNotification({
        userId: r.userId,
        type: 'SYSTEM',
        entityType: 'puzzle_report',
        entityId: r.id,
        preview: puzzleReviewedNotice(mode, dateKey, outcome, text),
        link,
      });
    } catch (err) {
      console.error('[puzzle-reports] review notice failed:', err);
    }
  }
  return { ok: true, reviewed: claimed.length };
}

/** English for push and e-mail; the key's params (`mode`, `dateKey`, `outcome`, `note`) are all the inbox needs. */
function puzzleReviewedNotice(mode: string, dateKey: string, outcome: ReviewOutcome, note: string | null) {
  const built = notice('puzzle-report-reviewed', { mode, dateKey, outcome, note: note ?? '' });
  const verdict =
    outcome === 'fault'
      ? 'You were right: the puzzle had a fault. Thank you.'
      : 'We checked the puzzle and its answer stands.';
  return {
    ...built,
    fallback: `Your report on the ${mode} puzzle for ${dateKey}: ${verdict}${note ? ` ${note}` : ''}`,
  };
}

/* ── The admin page ──────────────────────────────────────────────────────────────────────────────────────────── */

const emptyCounts = (): Record<ReportKind, number> => ({
  'two-answers': 0,
  'wrong-answer': 0,
  unclear: 0,
  other: 0,
});

interface ReportsOfDay {
  counts: Record<ReportKind, number>;
  items: AdminReportItem[];
  /** Open (unreviewed) reports among the listed rows. */
  open: number;
  review: { at: Date; outcome: ReviewOutcome; note: string | null } | null;
}

/** Reports for a mode on some days: counts by kind (`groupBy`) and each report with its member's handle. */
export async function reportsFor(mode: DailyPuzzleMode, dateKeys: string[]): Promise<Map<string, ReportsOfDay>> {
  const where = { gameMode: mode, dateKey: { in: dateKeys } } satisfies Prisma.DailyPuzzleReportWhereInput;
  const [grouped, rows] = await Promise.all([
    prisma.dailyPuzzleReport.groupBy({ by: ['gameMode', 'dateKey', 'kind'], where, _count: { _all: true } }),
    prisma.dailyPuzzleReport.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 500,
      select: {
        id: true,
        dateKey: true,
        kind: true,
        note: true,
        updatedAt: true,
        reviewedAt: true,
        reviewOutcome: true,
        reviewNote: true,
        user: { select: { handle: true } },
      },
    }),
  ]);
  const out = new Map<string, ReportsOfDay>();
  const slot = (dateKey: string) => {
    let s = out.get(dateKey);
    if (!s) {
      s = { counts: emptyCounts(), items: [], open: 0, review: null };
      out.set(dateKey, s);
    }
    return s;
  };
  for (const g of grouped) if (isReportKind(g.kind)) slot(g.dateKey).counts[g.kind] = g._count._all;
  for (const r of rows) {
    if (!isReportKind(r.kind)) continue;
    slot(r.dateKey).items.push({
      id: r.id,
      handle: r.user.handle,
      kind: r.kind,
      note: r.note,
      at: r.updatedAt.toISOString(),
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    });
    const slotOfDay = slot(r.dateKey);
    if (!r.reviewedAt) slotOfDay.open += 1;
    else if (isReviewOutcome(r.reviewOutcome) && (!slotOfDay.review || r.reviewedAt > slotOfDay.review.at)) {
      slotOfDay.review = { at: r.reviewedAt, outcome: r.reviewOutcome, note: r.reviewNote };
    }
  }
  return out;
}

/** One mode's days for the admin page: today + 2 down to today - 7, each with its puzzle, answer and reports. */
export async function adminDays(mode: DailyPuzzleMode, nowMs: number = Date.now()): Promise<AdminPuzzles> {
  const today = puzzleDayOf(nowMs);
  const keys = adminDayKeys(today);
  const [rows, scores, reports] = await Promise.all([
    prisma.dailyPuzzle.findMany({
      where: { gameMode: mode, dateKey: { in: keys } },
      select: { id: true, dateKey: true, source: true, data: true, createdAt: true },
    }),
    prisma.dailyPuzzleScore.groupBy({
      by: ['dateKey'],
      where: { gameMode: mode, dateKey: { in: keys } },
      _count: { _all: true },
    }),
    reportsFor(mode, keys),
  ]);
  const byDay = new Map(rows.map((r) => [r.dateKey, r]));
  const scoreByDay = new Map(scores.map((s) => [s.dateKey, s._count._all]));
  const days: AdminPuzzleDay[] = keys.map((dateKey) => {
    const row = byDay.get(dateKey);
    const scoreCount = scoreByDay.get(dateKey) ?? 0;
    const text = row ? describePuzzle(mode, row.data) : null;
    const rep = reports.get(dateKey);
    return {
      dateKey,
      relation: relationOf(dateKey, today),
      puzzle:
        row && text
          ? {
              id: row.id,
              createdAt: row.createdAt.toISOString(),
              source: row.source,
              puzzleText: text.puzzle,
              answerText: text.answer,
            }
          : null,
      scoreCount,
      replaceable: Boolean(row) && scoreCount === 0 && replaceTiming(dateKey, nowMs) === 'ok',
      generatable: !row && isAheadDay(dateKey, today),
      reportCounts: rep?.counts ?? emptyCounts(),
      reports: rep?.items ?? [],
      openReportCount: rep?.open ?? 0,
      review: rep?.review ? { outcome: rep.review.outcome, note: rep.review.note } : null,
    };
  });
  return { mode, today, days };
}

/* ── Generate now ────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Create a missing row for one of the next two days. It never replaces: an existing row is left alone, and
 * `getOrCreateDailyPuzzle` keeps its first-writer-wins read-back on a unique conflict.
 */
export async function generateNow(
  mode: DailyPuzzleMode,
  dateKey: string,
  nowMs: number = Date.now(),
): Promise<{ ok: true; created: boolean; source: string } | { ok: false; code: ErrorCode }> {
  if (!isAheadDay(dateKey, puzzleDayOf(nowMs))) return { ok: false, code: 'INVALID_INPUT' };
  const existing = await prisma.dailyPuzzle.findUnique({
    where: { gameMode_dateKey: { gameMode: mode, dateKey } },
    select: { source: true },
  });
  if (existing) return { ok: true, created: false, source: existing.source };
  const made = await getOrCreateDailyPuzzle(mode, dateKey);
  return { ok: true, created: true, source: made.source };
}

/* ── Replace ─────────────────────────────────────────────────────────────────────────────────────────────────── */

export interface ReplaceInput {
  mode: DailyPuzzleMode;
  dateKey: string;
  /** The row the admin saw. */
  seenId: string;
  seenCreatedAt: string;
}

export async function replaceFuturePuzzle(
  adminId: string,
  input: ReplaceInput,
): Promise<{ ok: true; source: string } | { ok: false; code: ErrorCode }> {
  const { mode, dateKey } = input;
  const seenAt = new Date(input.seenCreatedAt).getTime();
  if (!Number.isFinite(seenAt)) return { ok: false, code: 'INVALID_INPUT' };

  // A cheap early refusal so the model is not called for a day that is already closed. The transaction decides.
  const early = replaceTiming(dateKey, Date.now());
  if (early === 'outside-window') return { ok: false, code: 'INVALID_INPUT' };
  if (early === 'started') return { ok: false, code: 'PUZZLE_ALREADY_STARTED' };

  // 1. Generate first, outside any transaction: the model call takes seconds and must hold no lock and no row.
  const next = await generateForMode(mode, dateKey);

  // 2. One transaction under the day's lock re-checks everything, with the time read inside it.
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `daily-puzzle:${mode}:${dateKey}`);
    const timing = replaceTiming(dateKey, Date.now());
    if (timing === 'outside-window') return { ok: false as const, code: 'INVALID_INPUT' as const };
    if (timing === 'started') return { ok: false as const, code: 'PUZZLE_ALREADY_STARTED' as const };
    const scored = await tx.dailyPuzzleScore.findFirst({ where: { gameMode: mode, dateKey }, select: { id: true } });
    if (scored) return { ok: false as const, code: 'PUZZLE_ALREADY_STARTED' as const };
    const row = await tx.dailyPuzzle.findUnique({
      where: { gameMode_dateKey: { gameMode: mode, dateKey } },
      select: { id: true, createdAt: true, source: true },
    });
    if (!row || row.id !== input.seenId || row.createdAt.getTime() !== seenAt) {
      return { ok: false as const, code: 'PUZZLE_CHANGED' as const };
    }
    // 3. Update that row in place (never delete it) and record the action in the same transaction. No puzzle text.
    await tx.dailyPuzzle.update({ where: { id: row.id }, data: { data: next.data as object, source: next.source } });
    await recordAdminActionIn(tx, adminId, 'daily-puzzle-replace', {
      targetType: 'daily_puzzle',
      targetId: row.id,
      detail: `${mode} ${dateKey}: ${row.source} -> ${next.source}`,
    });
    return { ok: true as const, source: next.source };
  });
}

/* ── Export and erasure ──────────────────────────────────────────────────────────────────────────────────────── */

export async function exportPuzzleReports(userId: string): Promise<
  {
    gameMode: string;
    dateKey: string;
    kind: string;
    note: string | null;
    createdAt: string;
    updatedAt: string;
    reviewedAt: string | null;
    reviewOutcome: string | null;
    reviewNote: string | null;
  }[]
> {
  const rows = await prisma.dailyPuzzleReport.findMany({
    where: { userId },
    orderBy: [{ dateKey: 'asc' }, { gameMode: 'asc' }],
    select: {
      gameMode: true,
      dateKey: true,
      kind: true,
      note: true,
      createdAt: true,
      updatedAt: true,
      reviewedAt: true,
      reviewOutcome: true,
      reviewNote: true,
    },
  });
  return rows.map((r) => ({
    gameMode: r.gameMode,
    dateKey: r.dateKey,
    kind: r.kind,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    reviewOutcome: r.reviewOutcome,
    reviewNote: r.reviewNote,
  }));
}

/** The member's reports go with the account (account deletion anonymises in place, so the cascade never fires). */
export function puzzleReportErasureOps(userId: string) {
  return [prisma.dailyPuzzleReport.deleteMany({ where: { userId } })];
}
