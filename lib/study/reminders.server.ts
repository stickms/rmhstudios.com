/**
 * The daily flashcard reminder: the member's setting, the per-minute sweep that sends it, and the hooks
 * the review and erasure code call. A row's `nextAt` is the UTC instant of its next send, so the sweep reads
 * only rows that are due; every evaluation moves it on, sent or not, so no row is read twice.
 */
import type { PgBoss } from 'pg-boss';
import { dayOf } from '@/lib/calendar/tz';
import { createNotification } from '@/lib/notifications.server';
import { prisma } from '@/lib/prisma.server';
import { ACTIVE_REVIEW_WHERE, REVIEWABLE_WHERE } from '@/lib/study/card-query.server';
import type { ReminderSettings } from '@/lib/study/reminders.contract';
import {
  PAUSE_AFTER_REMINDERS,
  SWEEP_BATCH,
  isStale,
  nextReminderMs,
} from '@/lib/study/reminders';

export const STUDY_REMINDER_QUEUE = 'study.due-reminders';
export const STUDY_REMINDER_CRON = '* * * * *';

interface ReminderRow {
  enabled: boolean;
  localTime: string;
  timeZone: string;
  nextAt: Date | null;
  paused: boolean;
}

function toSettings(row: ReminderRow): ReminderSettings {
  return {
    enabled: row.enabled,
    time: row.localTime,
    timeZone: row.timeZone,
    nextAt: row.enabled && !row.paused && row.nextAt ? row.nextAt.toISOString() : null,
    paused: row.paused,
  };
}

export async function getReminder(userId: string): Promise<ReminderSettings | null> {
  const row = await prisma.flashcardReminder.findUnique({ where: { userId } });
  return row ? toSettings(row) : null;
}

/**
 * Save the member's setting and compute the next send. Turning the reminder on from off, or `resume`, clears
 * the pause and the no-review counter; a time or zone change never re-sends today (`lastSentDay` stays).
 */
export async function saveReminder(
  userId: string,
  input: { enabled: boolean; time: string; timeZone: string; resume?: boolean | undefined },
  now: number = Date.now(),
): Promise<ReminderSettings> {
  const existing = await prisma.flashcardReminder.findUnique({ where: { userId } });
  const resume = !!input.resume || (input.enabled && !existing?.enabled);
  const paused = resume ? false : (existing?.paused ?? false);
  const nextAt =
    input.enabled && !paused ? new Date(nextReminderMs(input.time, input.timeZone, now)) : null;
  const data = {
    enabled: input.enabled,
    localTime: input.time,
    timeZone: input.timeZone,
    nextAt,
    paused,
    ...(resume ? { sentSinceReview: 0 } : {}),
  };
  const row = await prisma.flashcardReminder.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return toSettings(row);
}

/** A review resets the no-review counter. The pause itself only ends when the member resumes. */
export async function markReviewed(userId: string): Promise<void> {
  await prisma.flashcardReminder.updateMany({
    where: { userId, sentSinceReview: { gt: 0 } },
    data: { sentSinceReview: 0 },
  });
}

/**
 * What the deck page calls "due today" (lib/study/stats.server.ts): scheduled cards whose `dueAt` has come,
 * plus reviewable cards the member has never reviewed, in decks they own (clones included); a suspended card
 * (it has a review row) is in neither. There is no
 * daily new-card limit in the study code, so new cards are not capped here either.
 */
async function dueCount(userId: string, now: Date): Promise<number> {
  const card = { ...REVIEWABLE_WHERE, deck: { userId } };
  const [scheduled, fresh] = await Promise.all([
    prisma.flashcardReview.count({ where: { userId, ...ACTIVE_REVIEW_WHERE, dueAt: { lte: now }, card } }),
    prisma.flashcard.count({ where: { ...card, reviews: { none: { userId } } } }),
  ]);
  return scheduled + fresh;
}

export interface SweepResult {
  read: number;
  sent: number;
}

/**
 * One sweep: for each member whose reminder time has passed, claim the local day (compare-and-set on
 * `lastSentDay`, `nextAt` and the switches, so two workers or a retry send once), then notify when cards are
 * due. A row that cannot be claimed, or has nothing due, still has `nextAt` moved on.
 */
export async function runDueReminderSweep(now: Date = new Date()): Promise<SweepResult> {
  const rows = await prisma.flashcardReminder.findMany({
    where: { enabled: true, paused: false, nextAt: { lte: now } },
    orderBy: { nextAt: 'asc' },
    take: SWEEP_BATCH,
    select: { userId: true, localTime: true, timeZone: true, nextAt: true },
  });
  let sent = 0;
  for (const row of rows) {
    const { nextAt } = row;
    if (!nextAt) continue;
    try {
      if (await sweepOne({ ...row, nextAt }, now)) sent++;
    } catch (err) {
      console.error('[study-reminders] sweep failed for one member:', err);
    }
  }
  return { read: rows.length, sent };
}

async function sweepOne(
  row: { userId: string; localTime: string; timeZone: string; nextAt: Date },
  now: Date,
): Promise<boolean> {
  const nowMs = now.getTime();
  const moveOn = new Date(nextReminderMs(row.localTime, row.timeZone, nowMs));
  const today = dayOf(nowMs, row.timeZone);

  const claim = await prisma.flashcardReminder.updateMany({
    where: {
      userId: row.userId,
      enabled: true,
      paused: false,
      nextAt: row.nextAt,
      OR: [{ lastSentDay: null }, { lastSentDay: { lt: today } }],
    },
    data: { lastSentDay: today, nextAt: moveOn },
  });
  if (claim.count === 0) {
    // Already sent today (or edited meanwhile): only move the schedule on.
    await prisma.flashcardReminder.updateMany({
      where: { userId: row.userId, nextAt: row.nextAt },
      data: { nextAt: moveOn },
    });
    return false;
  }
  if (isStale(row.nextAt.getTime(), nowMs)) return false;

  const member = await prisma.user.findUnique({ where: { id: row.userId }, select: { bannedUntil: true } });
  if (!member || (member.bannedUntil && member.bannedUntil.getTime() > nowMs)) return false;

  const count = await dueCount(row.userId, now);
  if (count === 0) return false;

  await createNotification({
    userId: row.userId,
    type: 'SYSTEM',
    entityType: 'study_due',
    entityId: today,
    preview: count === 1 ? '1 flashcard is due' : `${count} flashcards are due`,
    link: '/study',
    groupKey: `study-due:${today}`,
  });

  // Count it, then pause once the member has gone two weeks without reviewing. Two atomic updates, so a
  // concurrent review reset or a second sweep cannot lose a count.
  await prisma.flashcardReminder.updateMany({
    where: { userId: row.userId },
    data: { sentSinceReview: { increment: 1 } },
  });
  await prisma.flashcardReminder.updateMany({
    where: { userId: row.userId, sentSinceReview: { gte: PAUSE_AFTER_REMINDERS } },
    data: { paused: true, nextAt: null },
  });
  return true;
}

/** Every minute, send the reminders whose local time has come. Registered once from server/jobs/index.ts. */
export async function registerStudyReminderCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(STUDY_REMINDER_QUEUE);
  await boss.schedule(STUDY_REMINDER_QUEUE, STUDY_REMINDER_CRON, {}, { tz: 'UTC' });
  await boss.work(STUDY_REMINDER_QUEUE, async () => {
    await runDueReminderSweep();
  });
}

/** The member's reminder setting for the account export (null when they never saved one). */
export async function exportStudyReminder(userId: string) {
  const row = await prisma.flashcardReminder.findUnique({ where: { userId } });
  return row
    ? {
        enabled: row.enabled,
        time: row.localTime,
        timeZone: row.timeZone,
        paused: row.paused,
        remindersSinceLastReview: row.sentSinceReview,
        updatedAt: row.updatedAt.toISOString(),
      }
    : null;
}
