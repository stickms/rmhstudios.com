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
import { registerAll, retireQueues, type Registration } from './registry';
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
import { EMAIL_CAMPAIGN_QUEUE, registerEmailCampaignWorker } from '@/lib/email/campaign.server';
import { registerMaintenanceCrons } from '@/lib/jobs/maintenance.server';
import { registerArcadeCrons } from '@/lib/arcade/jobs.server';
import { GAME_UPDATE_FANOUT_QUEUE, registerGameUpdateFanoutWorker } from '@/lib/arcade/updates-jobs.server';
import { registerEconomyCrons } from '@/lib/economy/jobs.server';
import { registerCommunityCrons } from '@/lib/communities/jobs.server';
import { UPDATE_FANOUT_QUEUE } from '@/lib/events/updates';
import { registerEventUpdateWorker } from '@/lib/events/updates.server';
import { POST_ALERT_QUEUE, registerCommunityPostAlertWorker } from '@/lib/communities/post-alerts.server';
import { registerGiftingCrons } from '@/lib/gifting/jobs.server';
import { CHAT_EXPIRY_QUEUE, registerChatExpiryCron } from '@/lib/chat-plus/expiry.server';
import { STUDY_REMINDER_QUEUE, registerStudyReminderCron } from '@/lib/study/reminders.server';
import { STUDY_BUDDY_QUEUE, registerStudyBuddyCron } from '@/lib/calendar/study-buddy-jobs.server';
import { ANALYSIS_QUEUE, registerAnalysisWorker } from '@features/slice-it/engine/analysis-queue.server';
import { REGEN_QUEUE, registerRegenCron } from '@features/slice-it/engine/regen.server';
import { DUNESDAY_DAILY_QUEUE, registerDunesdayDailyCron } from '@/lib/dunesday/sync.server';
import {
  SOHUMTRACKER_ALERT_QUEUE,
  registerSohumTrackerAlertCron,
} from '@/lib/sohumtracker/alerts.server';
import { AFTER_ERASURE_QUEUE, registerAfterErasureWorker } from '@/lib/account/after-erasure-jobs.server';
import { registerAltairVerifyWorker } from '@features/altair/engine/verify/queue.server';
import { registerAltairSoloWorker } from '@features/altair/engine/solo/queue.server';
import { VERIFY_SOLO_QUEUE } from '@features/altair/engine/solo/job';
import { VERIFY_COOP_QUEUE } from '@features/altair/engine/verify/job';
import { registerPostsPlusCrons } from '@/lib/posts-plus/jobs.server';
import { SEND_SCHEDULED_QUEUE, registerSendScheduledMessagesCron } from '@/lib/messages/scheduled-jobs.server';
import { PARTY_REMINDERS_QUEUE, registerPartyRemindersCron } from '@/lib/rmhtube/parties-jobs.server';
import { DAILY_PUZZLE_PREWARM_QUEUE, registerDailyPuzzlePrewarmCron } from '@/lib/daily-puzzles/prewarm.server';
import { MATCH_CLAIM_QUEUE, registerMatchClaimCron } from '@/lib/tournaments/match-results.server';
import { MATCH_SCHEDULE_QUEUE, registerMatchScheduleCron } from '@/lib/tournaments/scheduling.server';
import { CHECKIN_OPEN_QUEUE, registerCheckInOpenCron } from '@/lib/tournaments/checkin-jobs.server';
import { POLL_ENDED_QUEUE, registerPollEndedCron } from '@/lib/feed/poll-lifecycle-jobs.server';
import { JAM_THEME_QUEUE, registerJamThemeCron } from '@/lib/competitive/jam-themes.server';
import { BULK_RECLAIM_QUEUE, BULK_RUN_QUEUE, registerBulkReclaimCron, registerBulkWorker } from '@/lib/bulk/queue.server';
import {
  SWEEP_QUEUE,
  SWEEP_RECLAIM_QUEUE,
  registerSweepReclaimCron,
  registerSweepWorker,
} from '@/lib/admin/sweeps-jobs.server';
import { FANOUT_RECLAIM_QUEUE, registerFanoutReclaimCron } from '@/lib/fanout/queue.server';
import { registerDiscoveryJobs } from '@/lib/discovery/jobs.server';
import { registerRecipeJobs } from '@/lib/developer/recipes.server';
import { WEBHOOK_RETRY_QUEUE, registerWebhookRetryCron } from '@/lib/webhooks/jobs.server';
import { PROFILE_LINK_REVERIFY_QUEUE, registerProfileLinkReverifyCron } from '@/lib/profile-links/jobs.server';
import { STREAK_REMINDER_QUEUE, registerStreakReminderCron } from '@/lib/streak-reminders.server';
import { SECURITY_LOG_PRUNE_QUEUE, registerSecurityLogPrune } from '@/lib/auth/security-log.server';
import { NEWS_INGEST_QUEUE, registerNewsIngestCron } from '@/lib/news-wire/ingest.server';
import { NEWS_FEED_PICK_QUEUE, registerNewsFeedPickCron } from '@/lib/news-wire/feed-pick.server';
import { registerReadingSubscriptionJobs } from '@/lib/reading/subscriptions-jobs.server';
import { registerBlogPublicationJobs } from '@/lib/blog/publication-jobs.server';
import { RECAP_QUEUE, registerRecapCron } from '@/lib/lights-out/recap.server';
import { registerDoctrineJobs } from '@features/doctrine/engine/jobs.server';
import { CLEANUP_QUEUE, registerCleanupCron } from '@/lib/cleanup-job.server';
import {
  MEDIA_CLIP_SWEEP_QUEUE,
  MEDIA_SWEEP_QUEUE,
  registerClipSweepCron,
  registerMediaSweepCron,
} from '@/lib/media/sweep-jobs.server';
import { HANDLE_CHANGE_QUEUE, registerHandleChangeCron } from '@/lib/account/handle-change-jobs.server';
import { MUTE_EXPIRY_QUEUE, registerMuteExpiryCron } from '@/lib/moderation/mute-expiry-jobs.server';
import {
  TYPE_CHALLENGE_EXPIRY_QUEUE,
  registerTypeChallengeExpiryCron,
} from '@/lib/rmhtype/challenges-jobs.server';
import { TOMBSTONE_PRUNE_QUEUE, registerTombstonePruneCron } from '@/lib/sync/tombstones.server';
import { SPEEDRUN_REVERIFY_QUEUE, registerSpeedrunReverifyCron } from '@/lib/speedrun/review-jobs.server';
import { CENSUS_QUEUE, registerCensusCron } from '@/lib/admin/census.server';
import { registerBotWorkerJobs } from '@/lib/rmhark-ai/bot-worker.server';
import {
  VIBE_THUMB_QUEUE,
  closeVibeThumbnailBrowser,
  registerVibeThumbnailCron,
} from '@/lib/rmhvibe/thumbnail-worker.server';
import {
  PROFILE_VISIT_SWEEP_QUEUE,
  registerProfileVisitSweepCron,
} from '@/lib/profile/visit-sweep.server';
import { registerDiscordBot, stopDiscordBot } from '../discord-bot/jobs';
import { RECURRING_QUEUE, registerRecurringThreadCron } from '@/lib/communities/recurring-jobs.server';
import { READ_ALONG_QUEUE, registerReadAlongCron } from '@/lib/communities/read-along-jobs.server';

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
  // In parallel: the Discord bot closes its gateway and lets in-flight replies finish (up to
  // DISCORD_BOT_DRAIN_GRACE, 60 s) while pg-boss drains its handlers (30 s), both inside the
  // container's 90 s stop_grace_period.
  await Promise.all([
    stopDiscordBot().catch(() => undefined),
    bossRef ? bossRef.stop({ graceful: true, timeout: 30_000 }).catch(() => undefined) : undefined,
  ]);
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
  // Admin email campaigns (/admin/email): fed by an admin pressing Send; batches of 100 through Resend.
  { queue: EMAIL_CAMPAIGN_QUEUE, register: registerEmailCampaignWorker },
  // O3 Slice It! beatmap generation. `enqueueAnalysis` runs inline when this worker is not up, so a
  // failure here is slow uploads, never chartless songs.
  { queue: ANALYSIS_QUEUE, register: registerAnalysisWorker },
  // Altair co-op: replay each finished match headlessly, persist only what the replay reproduces.
  // CPU-heavy, one job at a time; a failure leaves runs waiting, never recorded unverified.
  { queue: VERIFY_COOP_QUEUE, register: registerAltairVerifyWorker },
  // Altair single-player: replay each solo run, credit coins / leaderboard rows from the replay only.
  { queue: VERIFY_SOLO_QUEUE, register: registerAltairSoloWorker },
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
  // D3: RMHark bot-worker (ported from the Go worker): pool top-up (every minute, interval-gated), post / reply /
  // DM ticks (BOT_*_TICK_MS). Idles without DEEPSEEK_API_KEY.
  { queue: 'bot-worker', register: registerBotWorkerJobs },
  // D3: RMHVibe gallery thumbnails (ported from the Go worker): every minute, render up to 5 stale pages
  // in headless Chromium (PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, in this image) and upload to object storage.
  { queue: VIBE_THUMB_QUEUE, register: registerVibeThumbnailCron },
  // D3: the Discord bot (the Go supervisor and its copy are deleted), whenever a bot token is set: the gateway
  // connection lives in this process and its periodic work (care tick, tracker flush, identity poll, summarizer,
  // the B07 gateway heartbeat) are crons here. No token: it logs `discord_bot.disabled` and unschedules them.
  { queue: 'discord-bot', register: registerDiscordBot },
  // D4: data-lifecycle cleanup (sessions, verifications, notifications, comment views), daily at 04:00 UTC.
  // Moved from a node-cron + worker-lease in the ladder worker; the `exclusive` policy is the lock now.
  { queue: CLEANUP_QUEUE, register: registerCleanupCron },
  // Third-pass audit DT1: the monthly table and product census for /admin/census. Ticks nightly at
  // 03:40 UTC and writes a month's row only when that month has none.
  { queue: CENSUS_QUEUE, register: registerCensusCron },
  // M3 disappearing messages: expiry is enforced at read time; this only deletes the rows.
  { queue: CHAT_EXPIRY_QUEUE, register: registerChatExpiryCron },
  // F5: expire unmatched study-buddy requests and tell their owners.
  { queue: STUDY_BUDDY_QUEUE, register: registerStudyBuddyCron },
  // posts-plus: expiry sweep + daily auto-delete, dead-link rescue, due scheduled posts / time capsules.
  { queue: 'posts-plus', register: registerPostsPlusCrons },
  // The coming day's AI daily puzzles, written at 04:45 UTC (DeepSeek off-peak) before the first visitor asks.
  { queue: DAILY_PUZZLE_PREWARM_QUEUE, register: registerDailyPuzzlePrewarmCron },
  // P03 discovery: post-created fan-out, the daily "On this day" run, the /today digest snapshot.
  { queue: 'discovery', register: registerDiscoveryJobs },
  // P16 D5: "when X then Y" recipes: polled triggers + personal-best events.
  { queue: 'devplatform.recipes', register: registerRecipeJobs },
  // Developer webhooks: retry failed deliveries on their backoff (the first attempt is inline at emit).
  { queue: WEBHOOK_RETRY_QUEUE, register: registerWebhookRetryCron },
  // J1 §5: re-check verified profile links that have gone stale; a page that stopped linking back loses its mark.
  { queue: PROFILE_LINK_REVERIFY_QUEUE, register: registerProfileLinkReverifyCron },
  // Account security log: daily prune of events older than 365 days, 5,000 rows at a time.
  { queue: SECURITY_LOG_PRUNE_QUEUE, register: registerSecurityLogPrune },
  // RMH News: every 20 minutes, read the public feeds (lib/news-wire/sources.ts), store new headlines with a keyword
  // category and a picture, and prune wire rows older than 21 days. No model runs here; summaries are per click.
  { queue: NEWS_INGEST_QUEUE, register: registerNewsIngestCron },
  // RMH News in the feed: hourly, at most NEWS_FEED_PICKS_PER_DAY (default 4) stories a day, 3 h apart, each a repost
  // by the RMH News account of the story's discussion post.
  { queue: NEWS_FEED_PICK_QUEUE, register: registerNewsFeedPickCron },
  // Follow Logs and News: every 15 min one notification per new Log / published article per subscriber
  // (cursor + dedupe), and a daily 17:00 UTC email batch for members who turned email on.
  { queue: 'reading.subscriptions', register: registerReadingSubscriptionJobs },
  // s03-12: every minute, deliver the direct and group messages members scheduled for later.
  { queue: SEND_SCHEDULED_QUEUE, register: registerSendScheduledMessagesCron },
  // Log drafts: every minute, publish the scheduled Logs whose time has come (they then count as new for
  // announcements and subscriptions).
  { queue: 'blog.publish-due', register: registerBlogPublicationJobs },
  // s03-09: every 5 minutes, the 15-minute and at-start reminders for scheduled RMHTube watch parties; closes unopened ones.
  { queue: PARTY_REMINDERS_QUEUE, register: registerPartyRemindersCron },
  // s03-10: a work queue (not a cron) fed by publishing a patch note or a guide; tells that game's followers.
  { queue: GAME_UPDATE_FANOUT_QUEUE, register: registerGameUpdateFanoutWorker },
  // Sprint 04 (docs/autonomous/sprint-04/plan.md §Anchors)
  // s04-03 tournament-checkin
  // s04-03: every minute, tell the entrants of each tournament whose check-in window has just opened (once).
  { queue: CHECKIN_OPEN_QUEUE, register: registerCheckInOpenCron },

  // s04-08 poll-lifecycle
  // s04-08: every minute, tell the author and the voters of each poll that has just ended (once).
  { queue: POLL_ENDED_QUEUE, register: registerPollEndedCron },

  // Sprint 05 (docs/autonomous/sprint-05/plan.md §Anchors)
  // s05-17 community-post-alerts
  // s05-17: a work queue (not a cron) fed by a community post becoming visible; tells members who turned alerts on.
  { queue: POST_ALERT_QUEUE, register: registerCommunityPostAlertWorker },

  // s05-20 flashcard-reminders
  // s05-20: every minute, send the daily "flashcards are due" reminder to members whose chosen local time has come (once a day).
  { queue: STUDY_REMINDER_QUEUE, register: registerStudyReminderCron },

  // Sprint 06 (docs/autonomous/sprint-06/plan.md §Anchors)
  // s06-11 event-updates
  // s06-11: a work queue fed by an event update being posted; tells the people going, maybe or waitlisted (once).
  { queue: UPDATE_FANOUT_QUEUE, register: registerEventUpdateWorker },

  // s06-20 match-results
  // s06-20: every minute, settle result claims the opponent left unanswered for 15 minutes (never one that would finish the tournament).
  { queue: MATCH_CLAIM_QUEUE, register: registerMatchClaimCron },

  // Sprint 07 (docs/autonomous/sprint-07/plan.md §Anchors)
  // s07-06 match-scheduling
  // s07-06: every minute, remind both players an hour before an agreed match time and 12 hours before a match deadline (once each).
  { queue: MATCH_SCHEDULE_QUEUE, register: registerMatchScheduleCron },

  // s07-07 jam-themes
  // s07-07: every minute, reveal the theme of each voting jam that has started and tell the members who voted (once).
  { queue: JAM_THEME_QUEUE, register: registerJamThemeCron },

  // s07-15 bulk-durable
  // s07-15: a work queue fed by confirming a bulk clean-up (one job per operation); a lease on the row decides who runs it.
  { queue: BULK_RUN_QUEUE, register: registerBulkWorker },
  // s07-15: every minute, queue the clean-ups whose lease expired (their process restarted); the fifth restart stops one as failed.
  { queue: BULK_RECLAIM_QUEUE, register: registerBulkReclaimCron },

  // Sprint 08 (docs/autonomous/sprint-08/plan.md §Anchors)
  // s08-05 durable-fanouts
  // s08-05: every minute, queue the post-alert and event-update fan-outs whose lease expired; the fifth reclaim stops one as failed.
  { queue: FANOUT_RECLAIM_QUEUE, register: registerFanoutReclaimCron },

  // s08-09 recurring-threads
  // s08-09: every minute, post each due recurring community thread once (the occurrence is claimed before it posts).
  { queue: RECURRING_QUEUE, register: registerRecurringThreadCron },

  // s08-18 admin-spam-sweep
  // s08-18: a work queue fed by confirming or undoing a spam sweep (one job per sweep); a lease on the row decides who runs it.
  { queue: SWEEP_QUEUE, register: registerSweepWorker },
  // s08-18: every minute, re-queue the sweeps whose lease expired.
  { queue: SWEEP_RECLAIM_QUEUE, register: registerSweepReclaimCron },

  // Sprint 09 (docs/autonomous/sprint-09/plan.md §Anchors)
  // s09-10 api-sync-deletions
  // s09-10: daily at 03:41 UTC, delete sync tombstones older than 90 days in batches of 5,000.
  { queue: TOMBSTONE_PRUNE_QUEUE, register: registerTombstonePruneCron },

  // s09-12 media-sweep
  // s09-12: nightly at 03:17 UTC, delete uploads nobody uses (capped, oldest first); behind the `media-sweep` flag, off until the owner turns it on.
  { queue: MEDIA_SWEEP_QUEUE, register: registerMediaSweepCron },
  // s09-12: Sundays at 04:41 UTC, delete pronunciation clips no profile names and a week old; same flag.
  { queue: MEDIA_CLIP_SWEEP_QUEUE, register: registerClipSweepCron },

  // s09-16 erasure-boards
  // s09-16: a work queue fed by account deletion when an after-erasure step failed (one job per member); retried with backoff, idempotent.
  { queue: AFTER_ERASURE_QUEUE, register: registerAfterErasureWorker },

  // Sprint 10 (docs/autonomous/sprint-10/plan.md §Anchors)
  // s10-16 speedrun-queue
  // s10-16: daily at 04:23 UTC, re-run the verifier over queued speedruns (batches of 200, at most 2,000 a night); a changed verdict tells the runner once.
  { queue: SPEEDRUN_REVERIFY_QUEUE, register: registerSpeedrunReverifyCron },

  // s10-10 timed-mutes
  // s10-10: daily at 03:53 UTC, delete account mutes whose end has passed in batches of 1,000 (readers already ignore them).
  { queue: MUTE_EXPIRY_QUEUE, register: registerMuteExpiryCron },

  // s10-19 erasure-follows
  // s10-19: daily at 04:07 UTC, delete deleted accounts' handle changes past the 30-day reclaim window in batches of 1,000.
  { queue: HANDLE_CHANGE_QUEUE, register: registerHandleChangeCron },

  // Sprint 11 (docs/autonomous/sprint-11/plan.md §Anchors)
  // s11-09 read-alongs
  // s11-09: every five minutes, post each due read-along part's thread once (claimed first) and tell its joined readers once.
  { queue: READ_ALONG_QUEUE, register: registerReadAlongCron },

  // s11-12 type-challenges
  { queue: TYPE_CHALLENGE_EXPIRY_QUEUE, register: registerTypeChallengeExpiryCron },
];

/**
 * Crons whose feature was deleted. pg-boss keeps a schedule in its own table, so
 * removing the row above is not enough: without this the timekeeper would keep
 * filling a queue nobody works. Unscheduled and deleted at every boot
 * (./registry.ts `retireQueues`); an entry can come out a release or two later.
 */
const RETIRED_QUEUES: ReadonlyArray<string> = [
  // /pf2ecal was removed 2026-11-19 (replaced by /rmhcharacters); its morning reminder ran */10.
  'pf2ecal.reminder',
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
  if (!stopping) await retireQueues(boss, RETIRED_QUEUES, log);

  // On-call app alarms (lib/oncall/checks.server.ts): once a minute, read the
  // fleet's own telemetry and page the watchdog. Also this worker's heartbeat —
  // if the jobs container dies, the silence pages. No-op until ONCALL_* are set.
  if (stopping) return;
  stoppers.push(startOncallChecks());
  // One-minute rollups of the fleet's telemetry into ops_metric_minute, for the
  // /admin/alarms graphs (lib/ops/metrics-store.server.ts). Runs regardless of
  // on-call being configured.
  stoppers.push(startMetricsRollup());
  // Close the shared thumbnail browser (a no-op if nothing was rendered) so Chromium does not outlive us.
  stoppers.push(() => void closeVibeThumbnailBrowser().catch(() => undefined));
}

main().catch((e) => {
  console.error('[jobs] fatal:', e);
  process.exit(1);
});
