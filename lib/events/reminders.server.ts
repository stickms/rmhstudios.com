/**
 * Event reminder queue (pg-boss), split out of `events.server.ts` so the waitlist module can
 * schedule a promoted member's reminders without importing the module that imports it.
 */
import type { PgBoss } from 'pg-boss';
import { getBoss } from '@/lib/jobs/boss.server';

/** Delayed reminder jobs for RSVPs. Owned here, NOT registered in boss.server. */
export const EVENT_REMINDER_QUEUE = 'event.reminder';

type ReminderOffset = '24h' | '15m';

export interface EventReminderJob {
  eventId: string;
  userId: string;
  offset: ReminderOffset;
  /** K4 — the occurrence this reminder is for, on a repeating event. */
  occurrenceAt?: string;
}

const REMINDER_OFFSETS: { offset: ReminderOffset; leadMs: number }[] = [
  { offset: '24h', leadMs: 24 * 60 * 60 * 1000 },
  { offset: '15m', leadMs: 15 * 60 * 1000 },
];

const reminderKey = (
  eventId: string,
  userId: string,
  offset: ReminderOffset,
  occurrenceAt?: Date,
) =>
  `event-reminder:${eventId}:${userId}:${offset}${occurrenceAt ? `:${occurrenceAt.getTime()}` : ''}`;

// Idempotent per-process queue creation, memoised so we don't hit the DB on
// every RSVP. `stately` policy + a per-(event,user,offset) singletonKey gives us
// "one pending reminder per key" dedupe (a re-RSVP won't stack duplicates).
let queueReady: Promise<void> | null = null;
function ensureQueue(boss: PgBoss): Promise<void> {
  if (!queueReady) {
    queueReady = boss.createQueue(EVENT_REMINDER_QUEUE, { policy: 'stately' }).catch((e) => {
      queueReady = null; // allow a later retry
      throw e;
    });
  }
  return queueReady;
}

/**
 * Schedule the two reminder jobs for a 'going' RSVP. No-op when the queue is
 * unavailable (best-effort). Skips any offset whose fire time is already past,
 * and sets a generous `retentionSeconds` so a far-future reminder isn't reaped
 * by pg-boss's default 14-day created-state retention before it fires.
 */
export async function scheduleEventReminders(
  event: { id: string; startsAt: Date },
  userId: string,
  /** K4 — `event.startsAt` is one occurrence of a repeating event. */
  recurring = false,
): Promise<void> {
  const boss = await getBoss();
  if (!boss) return;
  try {
    await ensureQueue(boss);
    const now = Date.now();
    for (const { offset, leadMs } of REMINDER_OFFSETS) {
      const fireAt = new Date(event.startsAt.getTime() - leadMs);
      if (fireAt.getTime() <= now) continue;
      const retentionSeconds = Math.ceil((fireAt.getTime() - now) / 1000) + 86_400;
      await boss.send(
        EVENT_REMINDER_QUEUE,
        {
          eventId: event.id,
          userId,
          offset,
          ...(recurring ? { occurrenceAt: event.startsAt.toISOString() } : {}),
        } satisfies EventReminderJob,
        {
          startAfter: fireAt,
          singletonKey: reminderKey(event.id, userId, offset, recurring ? event.startsAt : undefined),
          retentionSeconds,
          retryLimit: 2,
        },
      );
    }
  } catch (e) {
    console.error('[events] failed to schedule reminders:', (e as Error)?.message);
  }
}

/**
 * Best-effort cancel of pending reminder jobs for an (event,user) pair — used on
 * un-RSVP and on switching to 'maybe'. If cancellation fails or the API can't
 * reach a job, the worker's re-check (RSVP must still be 'going') makes it a
 * no-op at fire time, so this is purely an optimisation.
 */
export async function cancelEventReminders(
  eventId: string,
  userId: string,
  occurrenceAt?: Date,
): Promise<void> {
  const boss = await getBoss();
  if (!boss) return;
  try {
    await ensureQueue(boss);
    for (const { offset } of REMINDER_OFFSETS) {
      const jobs = await boss.findJobs(EVENT_REMINDER_QUEUE, {
        key: reminderKey(eventId, userId, offset, occurrenceAt),
      });
      const ids = jobs.filter((j) => j.state === 'created' || j.state === 'retry').map((j) => j.id);
      if (ids.length) await boss.cancel(EVENT_REMINDER_QUEUE, ids);
    }
  } catch {
    /* best-effort — worker re-checks the RSVP before notifying */
  }
}

