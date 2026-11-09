/**
 * Streak-saver sweep (D3: ported from the Go worker `internal/streaksaver`).
 * Server-only; runs in the `jobs` worker as a pg-boss cron.
 *
 * On a schedule it finds daily-check-in streaks that are alive but have not been
 * extended in most of a day, writes an in-app "keep your streak" SYSTEM
 * notification (respecting the user's system-notification preference and a
 * once-per-window dedupe) and mirrors it to web push by calling
 * `sendPushToUser` directly (the Go worker had to hop over HTTP to
 * /api/internal/streak-push; that route is gone).
 *
 * Freshness for on-call (B06 `streak_sweep`, 3 h): the status service reads the
 * last COMPLETED job of STREAK_REMINDER_QUEUE from pg-boss's own job table, so a
 * sweep that throws (query failed) is a failed job and does not count. Individual
 * insert failures do not throw, exactly like the Go `RecordJob("streak_sweep","ok")`.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { sendPushToUser } from '@/lib/push/send.server';

export const STREAK_REMINDER_QUEUE = 'streak.reminder-sweep';

// Tuning, identical to the Go constants.
export const MIN_STREAK = 3; // don't pester users over a 1-2 day streak
export const LOWER_HOURS = 20; // last check-in older than this: the day is nearly gone
export const UPPER_HOURS = 44; // ...but not older than this (else the streak is already lost)
export const DEDUPE_HOURS = 20; // never send a second reminder inside this window
export const BATCH_LIMIT = 500; // cap work per sweep

export const REMINDER_ENTITY_TYPE = 'streak_reminder';
export const REMINDER_LINK = '/progress';
/** Minute of the hour the default hourly sweep fires (off :00, clear of the other staggered crons). */
export const STREAK_CRON_MINUTE = 23;

export interface Reminder {
  userId: string;
  current: number;
}

export function reminderPreview(current: number): string {
  return `Your ${current}-day streak is about to end — check in to keep it alive!`;
}

/** The web-push payload; identical to the old /api/internal/streak-push handler. */
export function reminderPush(current: number) {
  return {
    title: 'Keep your streak alive 🔥',
    body: `Your ${current}-day streak ends soon — check in to keep it going.`,
    url: REMINDER_LINK,
    tag: 'streak-reminder',
  };
}

/**
 * STREAK_REMINDER_INTERVAL_MINUTES -> cron (UTC). Unset/invalid = hourly.
 * Sub-hour intervals use a step; whole hours step the hour field at the offset minute.
 */
export function streakCron(intervalMinutes?: string | number | null): string {
  const n = Number(intervalMinutes);
  const minutes = Number.isInteger(n) && n > 0 ? n : 60;
  if (minutes < 60) return `*/${minutes} * * * *`;
  const hours = Math.min(24, Math.round(minutes / 60));
  return hours <= 1 ? `${STREAK_CRON_MINUTE} * * * *` : `${STREAK_CRON_MINUTE} */${hours} * * *`;
}

/**
 * `system IS NULL` means no preference row, which defaults to opted-in. Same
 * predicate as the Go `findAtRisk`.
 */
export function findAtRiskQuery(): Prisma.Sql {
  return Prisma.sql`
    SELECT s."userId" AS "userId", s."current" AS "current"
    FROM daily_streak s
    LEFT JOIN notification_preference np ON np."userId" = s."userId"
    WHERE s."current" >= ${MIN_STREAK}
      AND s."lastCheckIn" IS NOT NULL
      AND s."lastCheckIn" < now() - make_interval(hours => ${LOWER_HOURS}::int)
      AND s."lastCheckIn" > now() - make_interval(hours => ${UPPER_HOURS}::int)
      AND (np.system IS NULL OR np.system = true)
      AND NOT EXISTS (
        SELECT 1 FROM notification n
        WHERE n."userId" = s."userId"
          AND n."entityType" = ${REMINDER_ENTITY_TYPE}
          AND n."createdAt" > now() - make_interval(hours => ${DEDUPE_HOURS}::int)
      )
    LIMIT ${BATCH_LIMIT}`;
}

function notificationRow(r: Reminder) {
  return {
    userId: r.userId,
    type: 'SYSTEM' as const,
    entityType: REMINDER_ENTITY_TYPE,
    entityId: String(r.current),
    preview: reminderPreview(r.current),
    link: REMINDER_LINK,
    read: false,
  };
}

/** The slice of Prisma the sweep needs (mockable). */
export interface StreakDb {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
  notification: {
    createMany(args: { data: ReturnType<typeof notificationRow>[] }): Promise<unknown>;
    create(args: { data: ReturnType<typeof notificationRow> }): Promise<unknown>;
  };
}

/**
 * Write the in-app reminders and return the ones that landed. One batched
 * createMany; if it fails (e.g. a user deleted since the SELECT breaks a foreign
 * key) fall back to per-user creates so one bad row costs only itself.
 */
export async function insertAll(
  db: StreakDb,
  targets: Reminder[],
  log: Pick<Console, 'error'> = console,
): Promise<Reminder[]> {
  if (targets.length === 0) return [];
  try {
    await db.notification.createMany({ data: targets.map(notificationRow) });
    return targets;
  } catch (err) {
    log.error('[streak-saver] batch insert failed; retrying per user', (err as Error)?.message);
  }
  const out: Reminder[] = [];
  for (const t of targets) {
    try {
      await db.notification.create({ data: notificationRow(t) });
      out.push(t);
    } catch (err) {
      log.error('[streak-saver] insert reminder failed', t.userId, (err as Error)?.message);
    }
  }
  return out;
}

export interface SweepDeps {
  db?: StreakDb;
  push?: (userId: string, payload: ReturnType<typeof reminderPush>) => Promise<unknown>;
  log?: Pick<Console, 'error' | 'info'>;
}

/** One sweep. Throws if the at-risk query fails (the job fails; nothing is recorded as a success). */
export async function runStreakSweep(
  deps: SweepDeps = {},
): Promise<{ candidates: number; reminded: number }> {
  const db = deps.db ?? (prisma as unknown as StreakDb);
  const push = deps.push ?? sendPushToUser;
  const log = deps.log ?? console;

  const rows =
    await db.$queryRaw<{ userId: string; current: number | bigint }[]>(findAtRiskQuery());
  const targets: Reminder[] = rows.map((r) => ({ userId: r.userId, current: Number(r.current) }));

  const reminded = await insertAll(db, targets, log);
  if (reminded.length > 0) {
    log.info(`[streak-saver] reminders sent count=${reminded.length} candidates=${targets.length}`);
    // Mirror to web push, best-effort (no-op without VAPID); never fails the sweep.
    await Promise.allSettled(reminded.map((r) => push(r.userId, reminderPush(r.current))));
  }
  return { candidates: targets.length, reminded: reminded.length };
}

export async function registerStreakReminderCron(boss: {
  createQueue: (name: string, options?: object) => Promise<unknown>;
  schedule: (name: string, cron: string, data: object, options: object) => Promise<unknown>;
  work: (name: string, handler: () => Promise<void>) => Promise<unknown>;
  send?: (name: string, data: object, options?: object) => Promise<unknown>;
}): Promise<void> {
  if (process.env.STREAK_REMINDER_ENABLED === 'false') {
    console.warn('[streak-saver] disabled (STREAK_REMINDER_ENABLED=false)');
    return;
  }
  // exclusive: at most one sweep queued or active at a time, however many workers run.
  await boss.createQueue(STREAK_REMINDER_QUEUE, { policy: 'exclusive' });
  await boss.schedule(
    STREAK_REMINDER_QUEUE,
    streakCron(process.env.STREAK_REMINDER_INTERVAL_MINUTES),
    {},
    { tz: 'UTC' },
  );
  await boss.work(STREAK_REMINDER_QUEUE, async () => {
    await runStreakSweep();
  });
  // The Go worker also swept once at boot so a restart never skipped a window;
  // the dedupe guard makes an extra sweep harmless.
  await boss.send?.(STREAK_REMINDER_QUEUE, {}).catch(() => undefined);
}
