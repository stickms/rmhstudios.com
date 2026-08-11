/**
 * The reminder decision — the pure half of `reminders.server.ts`.
 *
 * Split out because this is the part worth testing and none of it needs a
 * database: it is arithmetic on a date and a settings row. It used to live in
 * `reminders.server.ts`, which imports `prisma` at module scope, so importing
 * `isReminderDue` in a unit test constructed a Prisma client — and the suite
 * failed with "DATABASE_URL environment variable is required" on any machine
 * that had not set one, for a test that never touches Postgres.
 *
 * This is the standard pairing in this repo (`coins.server.ts` +
 * `coins-schema.ts`): server-only effects behind the `.server` suffix, pure
 * logic beside it. `reminders.server.ts` re-exports everything here, so every
 * existing importer is unchanged.
 */

import type { BoardSettings } from './settings.server';
import { getZonedParts, zonedTimeToUtc } from './zoned-time';

export const PF2E_REMINDER_QUEUE = 'pf2ecal.reminder';

/**
 * Every 10 minutes. Fine enough that a reminder set for 09:00 lands by 09:10,
 * coarse enough that the sweep is invisible; the exact minute of a
 * "sometime this morning" ping is not worth a tighter loop.
 */
export const PF2E_REMINDER_CRON = '*/10 * * * *';

/**
 * How stale a due reminder may be and still fire.
 *
 * Without this, turning reminders on at 4pm would immediately post a "this
 * morning" reminder for tonight's game — technically due, useless as a message
 * — and a worker that had been down for a day would post a burst of them. Six
 * hours is comfortably wider than any real outage this matters for.
 */
export const REMINDER_GRACE_HOURS = 6;

/**
 * The instant a session's reminder is due: `reminderMinutes` past midnight on
 * the session's own local date, in the configured zone.
 *
 * Computed from the session's date rather than "now" so a reminder is always
 * tied to the night it is about — which is what makes the grace window below a
 * safe check rather than a guess.
 */
export function reminderInstantFor(
  startsAt: Date,
  settings: Pick<BoardSettings, 'reminderMinutes' | 'reminderTimeZone'>,
): Date {
  const local = getZonedParts(startsAt, settings.reminderTimeZone);
  return zonedTimeToUtc(
    {
      year: local.year,
      month: local.month,
      day: local.day,
      hour: Math.floor(settings.reminderMinutes / 60),
      minute: settings.reminderMinutes % 60,
    },
    settings.reminderTimeZone,
  );
}

/**
 * Whether a session is due for its reminder right now.
 *
 * Pure, and exported, because this is the whole decision and the rest of the
 * module is plumbing around it: it is far easier to be sure of four boundary
 * conditions in a unit test than in a cron that runs six times an hour.
 */
export function isReminderDue(
  session: { startsAt: Date; endsAt: Date; canceledAt: Date | null; reminderSentAt: Date | null },
  settings: Pick<BoardSettings, 'reminderMinutes' | 'reminderTimeZone'>,
  now: Date,
): boolean {
  if (session.canceledAt) return false;
  if (session.reminderSentAt) return false;
  // Nothing is "tonight" once it has started. A late worker should stay quiet
  // rather than announce a session the table is already sitting at.
  if (session.startsAt.getTime() <= now.getTime()) return false;

  const due = reminderInstantFor(session.startsAt, settings).getTime();
  if (now.getTime() < due) return false;
  if (now.getTime() - due > REMINDER_GRACE_HOURS * 3_600_000) return false;
  return true;
}
