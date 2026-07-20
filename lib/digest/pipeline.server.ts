/**
 * Weekly Digest pipeline (§10) — the batch runner + pg-boss cron registration.
 *
 * `runWeeklyDigest()` walks every user who opted into the digest
 * (`NotificationPreference.emailDigest === true`), assembles their personalized
 * payload (`assembleDigest`, which owns the "skip if recently active / nothing
 * to say" rules), and sends it via the shared `sendEmail`. Sends are staggered
 * by a hash of the user id so a cohort doesn't hit Resend all at once.
 *
 * `registerDigestCron(boss)` wires a weekly pg-boss cron. It is NOT called from
 * `boss.server.ts` (that file is read-only here) — the integrator calls it once
 * from the jobs worker (`server/jobs/index.ts`) after `getBoss(true)`.
 *
 * Server-only.
 */

import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { sendEmail } from '@/lib/email/send.server';
import { assembleDigest } from '@/lib/digest/assemble.server';
import { signUnsubToken } from '@/lib/email/unsubscribe';
import { SITE_URL } from '@/lib/seo';

/** pg-boss queue + cron for the weekly digest. */
export const WEEKLY_DIGEST_QUEUE = 'email.weekly-digest';
/** Mondays 14:00 UTC — mid-morning US, lunchtime EU. */
export const WEEKLY_DIGEST_CRON = '0 14 * * 1';

export interface DigestRunResult {
  eligible: number;
  sent: number;
  skipped: number;
  failed: number;
}

/** Cheap deterministic 32-bit hash of a string (for stagger ordering). */
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Assemble + send the digest to every opted-in user. Best-effort per user: a
 * single failure is logged and counted, never aborts the batch.
 *
 * @param staggerMs delay between sends (default 150ms) to smooth provider load.
 */
export async function runWeeklyDigest(staggerMs = 150): Promise<DigestRunResult> {
  const optedIn = await prisma.notificationPreference.findMany({
    where: { emailDigest: true },
    select: { userId: true },
  });

  // Order by an id hash so sends aren't correlated with signup order / handle
  // alphabet — spreads load evenly across whatever cohort opted in.
  const userIds = optedIn.map((p) => p.userId).sort((a, b) => hash32(a) - hash32(b));

  const result: DigestRunResult = { eligible: userIds.length, sent: 0, skipped: 0, failed: 0 };

  for (const userId of userIds) {
    try {
      const digest = await assembleDigest(userId);
      if (!digest) {
        // Ineligible (no email, recently active, or nothing worth sending).
        result.skipped++;
        continue;
      }
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (!user?.email) {
        result.skipped++;
        continue;
      }

      // RFC 8058 one-click unsubscribe headers, in addition to the footer link.
      const unsubUrl = `${SITE_URL}/api/email/unsubscribe?token=${encodeURIComponent(signUnsubToken(userId))}`;
      const ok = await sendEmail({
        to: user.email,
        subject: digest.subject,
        html: digest.html,
        text: digest.text,
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      if (ok) result.sent++;
      else result.failed++;
    } catch (error) {
      result.failed++;
      console.error(`[digest] failed for user ${userId}:`, error instanceof Error ? error.message : error);
    }
    if (staggerMs > 0) await sleep(staggerMs);
  }

  console.warn(`[digest] run complete: ${JSON.stringify(result)}`);
  return result;
}

/**
 * Register the weekly digest cron + worker on a running pg-boss instance.
 *
 * Call this ONCE from the jobs worker after `const boss = await getBoss(true)`:
 *
 * ```ts
 * import { registerDigestCron } from '@/lib/digest/pipeline.server';
 * // ... inside main(), after getBoss(true):
 * await registerDigestCron(boss);
 * ```
 *
 * Only the worker instance created with `getBoss(true)` has `schedule: true`,
 * so scheduling must happen there (not in the send-only web producer). Safe to
 * call more than once — `createQueue`/`schedule` are idempotent.
 */
export async function registerDigestCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(WEEKLY_DIGEST_QUEUE);
  // Cron trigger: enqueues one job per week onto the queue.
  await boss.schedule(WEEKLY_DIGEST_QUEUE, WEEKLY_DIGEST_CRON, {}, { tz: 'UTC' });
  // Consumer: runs the batch when the scheduled job lands.
  await boss.work(WEEKLY_DIGEST_QUEUE, async () => {
    await runWeeklyDigest();
  });
}
