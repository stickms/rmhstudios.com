/**
 * Morning-of Discord reminders.
 *
 * A pg-boss cron sweeps every 10 minutes and posts a reminder for any session
 * happening today whose reminder time has passed. The web tier never does this
 * — there is no cron there (`lib/CLAUDE.md`) — so it registers alongside the
 * other crons in `server/jobs/index.ts`.
 *
 * **Why a sweep and not a per-session scheduled job.** A job scheduled at
 * create time would have to be found and rescheduled every time someone moved
 * the session, cancelled it, or changed the reminder hour — three chances to
 * leave an orphan job that posts about a night that is not happening. A sweep
 * reads the current state each time it runs, so the state is the schedule and
 * there is nothing to keep in sync. It costs one indexed query every ten
 * minutes.
 *
 * **Idempotency** is `Pf2eSession.reminderSentAt`, claimed with a conditional
 * `updateMany` BEFORE the post goes out. Two workers racing (or one restarting
 * mid-run) cannot both send: the second update matches zero rows and skips.
 * The cost of that ordering is that a post which fails after the claim is not
 * retried — deliberately, because the alternative is a channel that gets the
 * same reminder five times when Discord is having a bad morning, and a missed
 * reminder is much cheaper than that.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { SITE_URL } from '@/lib/seo';
import { buildReminderPayload, postToWebhook, type ReminderSession } from './discord.server';
import { calendarWindow, personSelect, syncRule } from './sessions.server';
import { getSettings, type BoardSettings } from './settings.server';
import { getZonedParts, zonedTimeToUtc } from './zoned-time';

export { getSettings, SETTINGS_ID, type BoardSettings } from './settings.server';

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

const reminderSelect = {
  id: true,
  title: true,
  notes: true,
  location: true,
  startsAt: true,
  endsAt: true,
  canceledAt: true,
  reminderSentAt: true,
  responses: {
    select: {
      status: true,
      note: true,
      user: { select: personSelect },
    },
  },
} as const satisfies Prisma.Pf2eSessionSelect;

type ReminderRow = Prisma.Pf2eSessionGetPayload<{ select: typeof reminderSelect }>;

function toReminderSession(row: ReminderRow): ReminderSession {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    location: row.location,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    responses: row.responses.map((r) => ({
      status: r.status,
      note: r.note,
      name: r.user?.profile?.displayName?.trim() || r.user?.name?.trim() || 'Someone',
    })),
  };
}

export interface SweepResult {
  considered: number;
  sent: number;
  failed: number;
  skipped: string;
}

/**
 * One pass of the reminder sweep. Returns a summary rather than logging it, so
 * the caller decides how loud to be (the cron logs only when it did something).
 */
export async function runReminderSweep(now: Date = new Date()): Promise<SweepResult> {
  const settings = await getSettings();
  if (!settings.remindersEnabled || !settings.discordWebhookUrl) {
    return { considered: 0, sent: 0, failed: 0, skipped: 'reminders off' };
  }

  // Only the next couple of days can be due: the reminder fires on the
  // session's own date, so anything further out cannot have passed its time
  // yet. Bounding the query here keeps the sweep O(a handful) forever.
  const horizon = new Date(now.getTime() + 2 * 86_400_000);
  const candidates = await prisma.pf2eSession.findMany({
    where: {
      startsAt: { gt: now, lt: horizon },
      canceledAt: null,
      reminderSentAt: null,
    },
    orderBy: { startsAt: 'asc' },
    select: reminderSelect,
  });

  let sent = 0;
  let failed = 0;
  const boardUrl = `${SITE_URL}/pf2ecal`;

  for (const row of candidates) {
    if (!isReminderDue(row, settings, now)) continue;

    // Claim before sending — see the module note on why this ordering, and
    // what it costs.
    const claim = await prisma.pf2eSession.updateMany({
      where: { id: row.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (claim.count === 0) continue;

    const result = await postToWebhook(
      settings.discordWebhookUrl,
      buildReminderPayload(toReminderSession(row), boardUrl),
    );
    if (result.ok) {
      sent++;
    } else {
      failed++;
      // Release the claim only for failures that a later sweep could plausibly
      // succeed at. A 404 means the webhook is gone; retrying it every ten
      // minutes until the session starts is noise in the log and nothing else.
      if (result.status !== 404) {
        await prisma.pf2eSession.updateMany({
          where: { id: row.id },
          data: { reminderSentAt: null },
        });
      }
      console.error('[pf2ecal] reminder failed', { sessionId: row.id, error: result.error });
    }
  }

  return { considered: candidates.length, sent, failed, skipped: '' };
}

/**
 * Send a one-off test message, for the "Send a test" button in settings.
 *
 * Uses the URL the caller just typed rather than the stored one, so the button
 * verifies the value in the field before it is committed — testing what is
 * already saved would make the button useless for the case it exists for.
 */
export async function sendTestMessage(
  webhookUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await postToWebhook(webhookUrl, {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: 'Pathfinder 2e reminders are wired up',
        description:
          'This channel will get a reminder on the morning of each session, ' +
          'with the time and who has replied.',
        url: `${SITE_URL}/pf2ecal`,
        color: 0x1d1d1f,
      },
    ],
  });
  return { ok: result.ok, error: result.error };
}

/**
 * Register the sweep with pg-boss. Both calls are idempotent, so a worker
 * restart re-registering is a no-op.
 */
export async function registerPf2eReminderCron(boss: {
  createQueue: (name: string) => Promise<unknown>;
  schedule: (name: string, cron: string, data: object, options: object) => Promise<unknown>;
  work: (name: string, handler: () => Promise<void>) => Promise<unknown>;
}): Promise<void> {
  await boss.createQueue(PF2E_REMINDER_QUEUE);
  await boss.schedule(PF2E_REMINDER_QUEUE, PF2E_REMINDER_CRON, {}, { tz: 'UTC' });
  await boss.work(PF2E_REMINDER_QUEUE, async () => {
    // The sweep reads sessions the recurring rule may not have materialised yet
    // — on a quiet board nothing has touched the web tier in days — so the rule
    // is synced first. Without this the very first session after a redeploy
    // could exist only as a rule and get no reminder at all.
    await syncRule(calendarWindow());
    const result = await runReminderSweep();
    if (result.sent > 0 || result.failed > 0) {
      console.warn('[pf2ecal] reminder sweep', result);
    }
  });
}
