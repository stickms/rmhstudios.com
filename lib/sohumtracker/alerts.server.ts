/**
 * "Tell me when he joins voice."
 *
 * The page is live, but nobody keeps it open. This is the one thing the dossier
 * can push rather than wait to be looked at, and it is deliberately the ONLY
 * thing: a notification for every message he sent would be a notification about
 * somebody's Tuesday, several times an hour, and would turn a joke into
 * surveillance nobody asked to receive.
 *
 * # Why it is a sweep and not a callback from the tracker
 *
 * The tracker is a Go worker; push is a Node concern (VAPID keys, the
 * `push_subscription` table, dead-endpoint cleanup). Rather than teach Go to
 * speak web push — a second implementation of the encryption and the 410
 * handling — the sweep reads the row the tracker already writes. One indexed
 * query a minute, and it needs no coordination between the two runtimes at all.
 *
 * # Why the claim is taken before the send
 *
 * `alertedAt` is claimed with a conditional `updateMany`, so two workers racing
 * (or one restarting mid-run) cannot both notify. The cost is that a send which
 * fails after the claim is not retried — which is right for a notification whose
 * entire value is that it is about something happening RIGHT NOW.
 */

import { prisma } from '@/lib/prisma.server';
import { sendPushToUser } from '@/lib/push/send.server';
import { SITE_URL } from '@/lib/seo';
import { SUBJECT_DISCORD_ID, SUBJECT_FALLBACK_NAME } from './config';

/** The queue name and cadence, exported so the jobs worker can register them. */
export const SOHUMTRACKER_ALERT_QUEUE = 'sohumtracker.voice-alert';

/**
 * Every minute. The whole point is "he is in a call now", and pg-boss's floor is
 * a minute anyway; anything slower would deliver a notification about a call
 * that had already ended.
 */
export const SOHUMTRACKER_ALERT_CRON = '* * * * *';

/**
 * How stale a join may be and still be worth announcing.
 *
 * Without this, a worker that had been down for a day would come back and
 * announce a session from yesterday morning as if it had just started. Ten
 * minutes is longer than any deploy and shorter than any call worth missing.
 */
const ALERT_GRACE_MS = 10 * 60_000;

/**
 * Minimum gap between notifications to the same subscriber.
 *
 * He joins, leaves and rejoins several times an evening — often within seconds,
 * because a channel move is a leave and a join. Without this the first hour of a
 * game night is six notifications about the same game night.
 */
const ALERT_COOLDOWN_MS = 3 * 60 * 60_000;

/** The alert kind, matching the `kind` column. One so far. */
const VOICE = 'voice';

export interface AlertSweepResult {
  /** Open sessions considered. */
  considered: number;
  /** Subscribers actually pushed to. */
  notified: number;
  skipped: string;
}

/** Whether a signed-in user has the voice alert switched on. */
export async function isAlertEnabled(userId: string): Promise<boolean> {
  const row = await prisma.discordWatchAlert.findUnique({
    where: {
      userId_discordId_kind: { userId, discordId: SUBJECT_DISCORD_ID, kind: VOICE },
    },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Switch the alert on or off. Idempotent in both directions — the button can be
 * double-tapped and the row is either there or it is not.
 */
export async function setAlertEnabled(userId: string, enabled: boolean): Promise<void> {
  const where = {
    userId_discordId_kind: { userId, discordId: SUBJECT_DISCORD_ID, kind: VOICE },
  };
  if (enabled) {
    await prisma.discordWatchAlert.upsert({
      where,
      create: { userId, discordId: SUBJECT_DISCORD_ID, kind: VOICE },
      update: {},
    });
    return;
  }
  await prisma.discordWatchAlert.deleteMany({
    where: { userId, discordId: SUBJECT_DISCORD_ID, kind: VOICE },
  });
}

/**
 * One pass: find a voice session that opened recently and has not been
 * announced, claim it, and push to everyone who asked.
 *
 * Returns a summary rather than logging it, so the caller decides how loud to be.
 */
export async function runVoiceAlertSweep(now: Date = new Date()): Promise<AlertSweepResult> {
  const sessions = await prisma.discordWatchVoiceSession.findMany({
    where: {
      discordId: SUBJECT_DISCORD_ID,
      leftAt: null,
      alertedAt: null,
      joinedAt: { gte: new Date(now.getTime() - ALERT_GRACE_MS) },
    },
    orderBy: { joinedAt: 'desc' },
    select: { id: true, channelName: true, joinedAt: true },
  });
  if (sessions.length === 0) return { considered: 0, notified: 0, skipped: 'nothing open' };

  // Claim every candidate up front, even the ones we will not announce: a
  // session that stayed open past the grace window must not be re-considered on
  // every sweep for the rest of the evening.
  const claimed: typeof sessions = [];
  for (const session of sessions) {
    const claim = await prisma.discordWatchVoiceSession.updateMany({
      where: { id: session.id, alertedAt: null },
      data: { alertedAt: now },
    });
    if (claim.count > 0) claimed.push(session);
  }
  if (claimed.length === 0) return { considered: sessions.length, notified: 0, skipped: 'claimed' };

  const subscribers = await prisma.discordWatchAlert.findMany({
    where: {
      discordId: SUBJECT_DISCORD_ID,
      kind: VOICE,
      OR: [
        { lastNotifiedAt: null },
        { lastNotifiedAt: { lt: new Date(now.getTime() - ALERT_COOLDOWN_MS) } },
      ],
    },
    select: { id: true, userId: true },
  });
  if (subscribers.length === 0) {
    return { considered: sessions.length, notified: 0, skipped: 'no subscribers due' };
  }

  // One notification per subscriber even if two sessions were claimed (a channel
  // move is a leave and a join): they asked to be told he is in a call, and he
  // is in a call once.
  const session = claimed[0];
  const where = session.channelName ? `#${session.channelName}` : 'a voice channel';

  await Promise.all(
    subscribers.map(async (subscriber) => {
      await sendPushToUser(subscriber.userId, {
        title: `${SUBJECT_FALLBACK_NAME} is in voice`,
        body: `He just joined ${where}.`,
        url: `${SITE_URL}/sohumtracker`,
        // One tag for the whole feature, so a second notification replaces the
        // first on the device rather than stacking.
        tag: 'sohumtracker-voice',
      });
    }),
  );
  await prisma.discordWatchAlert.updateMany({
    where: { id: { in: subscribers.map((s) => s.id) } },
    data: { lastNotifiedAt: now },
  });

  return { considered: sessions.length, notified: subscribers.length, skipped: '' };
}

/**
 * Register the sweep with pg-boss. Both calls are idempotent, so a worker
 * restart re-registering is a no-op.
 */
export async function registerSohumTrackerAlertCron(boss: {
  createQueue: (name: string) => Promise<unknown>;
  schedule: (name: string, cron: string, data: object, options: object) => Promise<unknown>;
  work: (name: string, handler: () => Promise<void>) => Promise<unknown>;
}): Promise<void> {
  await boss.createQueue(SOHUMTRACKER_ALERT_QUEUE);
  await boss.schedule(SOHUMTRACKER_ALERT_QUEUE, SOHUMTRACKER_ALERT_CRON, {}, { tz: 'UTC' });
  await boss.work(SOHUMTRACKER_ALERT_QUEUE, async () => {
    const result = await runVoiceAlertSweep();
    // Quiet on the common case, which is every minute of every day he is not in
    // a call. A log line a minute would bury everything else in this worker.
    if (result.notified > 0) {
      console.warn('[sohumtracker] voice alert sweep', result);
    }
  });
}
