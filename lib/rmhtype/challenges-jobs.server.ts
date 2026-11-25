/**
 * Hourly tidy-up for RMHType challenges (s11-12): a challenge nobody raced within 7 days becomes `expired` (no notice),
 * and a race stuck in `racing` for more than 15 minutes (a hub restart loses its room) is settled as "Did not finish",
 * with the usual result notices. Correctness never depends on the job having run for a pending challenge (a lapsed
 * row is refused at the claim); it is what settles a race whose socket never came back.
 */
import type { PgBoss } from 'pg-boss';
import { createNotification } from '@/lib/notifications.server';
import { prisma } from '@/lib/prisma.server';
import { expireChallenges, resultNoticesFor, type ChallengeDb } from '@/lib/rmhtype/challenges-settle.server';

export const TYPE_CHALLENGE_EXPIRY_QUEUE = 'rmhtype.challenge-expiry';
/** Hourly, at :17 past. */
export const TYPE_CHALLENGE_EXPIRY_CRON = '17 * * * *';

/** One pass: expire and settle, then tell both sides of every race it settled. Best-effort on the notices. */
export async function runChallengeExpiry(db: ChallengeDb = prisma as unknown as ChallengeDb, now: Date = new Date()) {
  const pass = await expireChallenges(db, now);
  for (const settled of pass.settled) {
    try {
      for (const n of await resultNoticesFor(db, settled)) await createNotification(n);
    } catch (error) {
      console.error('[type-challenges] could not notify', error);
    }
  }
  return pass;
}

/** Register the hourly pass. Called once from the jobs worker (only it can schedule). */
export async function registerTypeChallengeExpiryCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(TYPE_CHALLENGE_EXPIRY_QUEUE);
  await boss.schedule(TYPE_CHALLENGE_EXPIRY_QUEUE, TYPE_CHALLENGE_EXPIRY_CRON, {}, { tz: 'UTC' });
  await boss.work(TYPE_CHALLENGE_EXPIRY_QUEUE, async () => {
    await runChallengeExpiry();
  });
}
