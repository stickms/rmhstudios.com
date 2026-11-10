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
import { installProcessGuards } from '../../lib/perf/process-guards';

import { type Job, type PgBoss } from 'pg-boss';
import { registerAll, type Registration } from './registry';
import { withQueuePolicy } from './queue-policy';
import { createLogger } from '@/server/shared/logger';
import { startProcessMetrics } from '../../lib/perf/process-metrics';
import { registerPrismaPoolGauges, startPerfPublisher } from '../../lib/perf/publish.server';
import { startOncallChecks } from '../../lib/oncall/checks.server';
import { startMetricsRollup } from '../../lib/ops/metrics-store.server';
import { getBoss, PROGRESSION_QUEUE } from '@/lib/jobs/boss.server';
import { runProgression, type ProgressionJob } from '@/lib/social/engagement-effects.server';
import { registerEventReminderWorker } from '@/lib/events.server';
import { registerDigestCron } from '@/lib/digest/pipeline.server';
import { registerMaintenanceCrons } from '@/lib/jobs/maintenance.server';
import { registerArcadeCrons } from '@/lib/arcade/jobs.server';
import { registerEconomyCrons } from '@/lib/economy/jobs.server';
import { registerCommunityCrons } from '@/lib/communities/jobs.server';
import { registerGiftingCrons } from '@/lib/gifting/jobs.server';
import { CHAT_EXPIRY_QUEUE, registerChatExpiryCron } from '@/lib/chat-plus/expiry.server';
import { STUDY_BUDDY_QUEUE, registerStudyBuddyCron } from '@/lib/calendar/study-buddy-jobs.server';
import { ANALYSIS_QUEUE, registerAnalysisWorker } from '@/lib/slice-it/analysis-queue.server';
import { REGEN_QUEUE, registerRegenCron } from '@/lib/slice-it/regen.server';
import { PF2E_REMINDER_QUEUE, registerPf2eReminderCron } from '@/lib/pf2ecal/reminders.server';
import { DUNESDAY_DAILY_QUEUE, registerDunesdayDailyCron } from '@/lib/dunesday/sync.server';
import {
  SOHUMTRACKER_ALERT_QUEUE,
  registerSohumTrackerAlertCron,
} from '@/lib/sohumtracker/alerts.server';
import { registerAltairVerifyWorker } from '@/lib/altair/verify/queue.server';
import { registerAltairSoloWorker } from '@/lib/altair/solo/queue.server';
import { VERIFY_SOLO_QUEUE } from '@/lib/altair/solo/job';
import { VERIFY_COOP_QUEUE } from '@/lib/altair/verify/job';
import { registerPostsPlusCrons } from '@/lib/posts-plus/jobs.server';
import { registerDiscoveryJobs } from '@/lib/discovery/jobs.server';
import { registerRecipeJobs } from '@/lib/devplatform/recipes.server';
import {
  STREAK_REMINDER_QUEUE,
  registerStreakReminderCron,
} from '@/lib/streak-reminders.server';
import { RECAP_QUEUE, registerRecapCron } from '@/lib/lights-out/recap.server';
import { registerDoctrineJobs } from '@/lib/doctrine/jobs.server';
import {
  PROFILE_VISIT_SWEEP_QUEUE,
  registerProfileVisitSweepCron,
} from '@/lib/profile/visit-sweep.server';

// Log + count instead of dying on a stray rejection (lib/perf/process-guards.ts).
installProcessGuards({ service: 'jobs' });

const log = createLogger('jobs');

// ─── Shutdown (installed before any startup await) ────────────────
// The handlers used to be registered at the very end of main(), after every
// queue registration: a SIGTERM during startup took Node's default (immediate
// exit, no graceful pg-boss stop) and a second signal re-ran the whole stop.
let stopping = false;
let bossRef: PgBoss | null = null;
/** Boot attempts after the first, and the gap between them (just over `RETRY_AFTER_MS` in lib/jobs/boss.server.ts). */
const BOOT_RETRIES = 3;
const BOOT_RETRY_MS = 31_000;
const stoppers: Array<() => void> = [];

async function shutdown(sig: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info({ event: 'jobs.stopping', signal: sig });
  for (const stop of stoppers) {
    try {
      stop();
    } catch {
      /* best-effort */
    }
  }
  if (bossRef) {
    try {
      await bossRef.stop({ graceful: true, timeout: 30_000 });
    } catch {
      /* best-effort */
    }
  }
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

/**
 * Every queue family this worker owns, registered in this order after the
 * progression worker. One failing entry is logged (`jobs.register_failed`) and
 * the rest still register; each success logs `jobs.started` (./registry.ts).
 * Crons are scheduled here and only here: the web tier is send-only.
 */
const REGISTRATIONS: ReadonlyArray<Registration<PgBoss>> = [
  // RMHEvents §6: T-24h / T-15m RSVP reminders. Own queue; re-checks the RSVP before firing.
  { queue: 'event.reminder', register: registerEventReminderWorker },
  // Weekly digest email (§10): its own pg-boss cron.
  { queue: 'email.weekly-digest', register: registerDigestCron },
  // O3 Slice It! beatmap generation. `enqueueAnalysis` runs inline when this worker is not up, so a
  // failure here is slow uploads, never chartless songs.
  { queue: ANALYSIS_QUEUE, register: registerAnalysisWorker },
  // Altair co-op: replay each finished match headlessly, persist only what the replay reproduces.
  // CPU-heavy, one job at a time; a failure leaves runs waiting, never recorded unverified.
  { queue: VERIFY_COOP_QUEUE, register: registerAltairVerifyWorker },
  // Altair single-player: replay each solo run, credit coins / leaderboard rows from the replay only.
  { queue: VERIFY_SOLO_QUEUE, register: registerAltairSoloWorker },
  // The PF2e table's morning-of Discord reminders: a no-op unless a board has a webhook and reminders on.
  { queue: PF2E_REMINDER_QUEUE, register: registerPf2eReminderCron },
  // /dunesday "tonight's lineup" Discord posts (every 10 min, idempotent per plan date).
  { queue: DUNESDAY_DAILY_QUEUE, register: registerDunesdayDailyCron },
  // /sohumtracker voice alert: minute-by-minute sweep of the open voice session; push stays in Node.
  { queue: SOHUMTRACKER_ALERT_QUEUE, register: registerSohumTrackerAlertCron },
  // C8: bring stale generated charts up to the current generator (25 songs an hour); never touches
  // a chart with `isGenerated: false`.
  { queue: REGEN_QUEUE, register: registerRegenCron },
  // Platform maintenance: outbox drain (every minute, the delivery path for webhooks and
  // notifications), hourly idempotency/outbox sweeps, nightly achievement rarity, and the rest.
  { queue: 'platform.maintenance', register: registerMaintenanceCrons },
  { queue: 'arcade.rivals', register: registerArcadeCrons },
  // Economy-plus: community goal deadlines + refunds, scheduled gifts, wishlist alerts. These move
  // coins, so each handler is idempotent and claims its work conditionally.
  { queue: 'economy', register: registerEconomyCrons },
  // Gifting & events: daily birthday nudges and the exchange draw sweep.
  { queue: 'gifting', register: registerGiftingCrons },
  // Communities-plus: challenge winners and the daily top-contributors rebuild.
  { queue: 'communities', register: registerCommunityCrons },
  // P9: nightly sweep of the profile visitor-counter dedupe ledger.
  { queue: PROFILE_VISIT_SWEEP_QUEUE, register: registerProfileVisitSweepCron },
  // D3: streak-saver (ported from the Go worker). Hourly "keep your streak" notification + web push;
  // STREAK_REMINDER_ENABLED=false skips it. The status service watches its last success (B06).
  { queue: STREAK_REMINDER_QUEUE, register: registerStreakReminderCron },
  // D3: Lights Out → Discord daily recap (ported from the Go worker), every 5 min. The status service
  // watches its last success (B06 `recap`).
  { queue: RECAP_QUEUE, register: registerRecapCron },
  // D3: Doctrine Engine (ported from the Go worker): tomorrow's puzzles at 00:00 UTC (A19 watches the
  // table), Sahur activation every minute (B06 `sahur_activation`), Monday reputation decay.
  { queue: 'doctrine', register: registerDoctrineJobs },
  // M3 disappearing messages: expiry is enforced at read time; this only deletes the rows.
  { queue: CHAT_EXPIRY_QUEUE, register: registerChatExpiryCron },
  // F5: expire unmatched study-buddy requests and tell their owners.
  { queue: STUDY_BUDDY_QUEUE, register: registerStudyBuddyCron },
  // posts-plus: expiry sweep + daily auto-delete, dead-link rescue, due scheduled posts / time capsules.
  { queue: 'posts-plus', register: registerPostsPlusCrons },
  // P03 discovery: post-created fan-out, the daily "On this day" run, the /today digest snapshot.
  { queue: 'discovery', register: registerDiscoveryJobs },
  // P16 D5: "when X then Y" recipes: polled triggers + personal-best events.
  { queue: 'devplatform.recipes', register: registerRecipeJobs },
];

async function main() {
  // Process metrics for the admin performance page: sample this worker and publish
  // a snapshot to Redis every 10 s (best-effort; see lib/perf/publish.server.ts).
  try {
    startProcessMetrics({ service: 'jobs' });
    registerPrismaPoolGauges();
    startPerfPublisher('jobs');
  } catch {
    // Telemetry must not stop the worker from starting.
  }

  // A blip at boot (Postgres restarting, a pool full right after a deploy's migrations) used to exit(1): Docker restarted
  // the container and deploy.sh read the changed RestartCount as a failed release. Retry in-process first.
  // `getBoss` memoises a failed start for BOOT_RETRY_MS (lib/jobs/boss.server.ts RETRY_AFTER_MS), so wait it out.
  // With no DATABASE_URL there is nothing to retry: exit at once, as before.
  let boss = await getBoss(true);
  for (let attempt = 1; !boss && process.env.DATABASE_URL && attempt <= BOOT_RETRIES; attempt++) {
    if (stopping) return;
    log.warn({ event: 'jobs.start_retry', attempt, of: BOOT_RETRIES });
    await new Promise((resolve) => setTimeout(resolve, BOOT_RETRY_MS));
    boss = await getBoss(true);
  }
  if (!boss) {
    log.error({
      event: 'jobs.start_failed',
      reason: 'DATABASE_URL unset or pg-boss failed to start',
    });
    process.exit(1);
  }
  bossRef = boss;
  if (stopping) return; // a signal arrived during start; shutdown() stops boss

  const policed = withQueuePolicy(boss, log);

  await policed.work<ProgressionJob>(PROGRESSION_QUEUE, async (jobs: Job<ProgressionJob>[]) => {
    for (const job of jobs) {
      // Throw on failure so pg-boss retries per the send options; runProgression
      // itself swallows per-leg errors, so a throw here is a genuine infra fault.
      await runProgression(job.data);
    }
  });

  log.info({ event: 'jobs.started', queue: PROGRESSION_QUEUE });

  await registerAll(policed, REGISTRATIONS, log, () => stopping);

  // On-call app alarms (lib/oncall/checks.server.ts): once a minute, read the
  // fleet's own telemetry and page the watchdog. Also this worker's heartbeat —
  // if the jobs container dies, the silence pages. No-op until ONCALL_* are set.
  if (stopping) return;
  stoppers.push(startOncallChecks());
  // One-minute rollups of the fleet's telemetry into ops_metric_minute, for the
  // /admin/alarms graphs (lib/ops/metrics-store.server.ts). Runs regardless of
  // on-call being configured.
  stoppers.push(startMetricsRollup());
}

main().catch((e) => {
  console.error('[jobs] fatal:', e);
  process.exit(1);
});
