/**
 * Jobs Worker — the durable async backbone consumer (rewrite R2).
 *
 * Long-lived Node.js process that drains the pg-boss queues. It owns queue
 * maintenance/scheduling (the web tier is send-only) and runs the background
 * work that used to block request handlers — starting with engagement
 * progression (achievements/XP/quests/webhook). Runs as its own Docker service
 * (or dev process) alongside the other workers.
 *
 * Degrades safely: if `DATABASE_URL` is unset the queue can't start, so the web
 * tier's `enqueueProgression` runs the work inline instead — this process is an
 * optimisation, never a correctness dependency.
 */
import 'dotenv/config';
import { type Job } from 'pg-boss';
import { createLogger } from '@/server/shared/logger';
import { getBoss, PROGRESSION_QUEUE } from '@/lib/jobs/boss.server';
import { runProgression, type ProgressionJob } from '@/lib/social/engagement-effects.server';
import { registerEventReminderWorker } from '@/lib/events.server';
import { registerDigestCron } from '@/lib/digest/pipeline.server';

const log = createLogger('jobs');

async function main() {
  const boss = await getBoss(true);
  if (!boss) {
    log.error({
      event: 'jobs.start_failed',
      reason: 'DATABASE_URL unset or pg-boss failed to start',
    });
    process.exit(1);
  }

  await boss.work<ProgressionJob>(PROGRESSION_QUEUE, async (jobs: Job<ProgressionJob>[]) => {
    for (const job of jobs) {
      // Throw on failure so pg-boss retries per the send options; runProgression
      // itself swallows per-leg errors, so a throw here is a genuine infra fault.
      await runProgression(job.data);
    }
  });

  log.info({ event: 'jobs.started', queue: PROGRESSION_QUEUE });

  // Event reminders (RMHEvents §6): T-24h / T-15m RSVP reminders. Creates its
  // own queue idempotently and re-checks the RSVP before firing.
  try {
    await registerEventReminderWorker(boss);
    log.info({ event: 'jobs.started', queue: 'event.reminder' });
  } catch (e) {
    log.error({
      event: 'jobs.register_failed',
      queue: 'event.reminder',
      err: (e as Error)?.message,
    });
  }

  // Weekly digest email (§10): schedules its own pg-boss cron (worker-only,
  // since only the worker instance has schedule:true).
  try {
    await registerDigestCron(boss);
    log.info({ event: 'jobs.started', queue: 'email.weekly-digest' });
  } catch (e) {
    log.error({
      event: 'jobs.register_failed',
      queue: 'email.weekly-digest',
      err: (e as Error)?.message,
    });
  }

  const shutdown = async (sig: string) => {
    log.info({ event: 'jobs.stopping', signal: sig });
    try {
      await boss.stop({ graceful: true });
    } catch {
      /* best-effort */
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e) => {
  console.error('[jobs] fatal:', e);
  process.exit(1);
});
