/* eslint-disable no-console */
/**
 * Ladder Worker — job-discovery pipeline consumer
 *
 * Long-lived Node.js process that runs the job-discovery pipeline on a
 * configurable schedule (default: every 12 hours, LADDER_CRON_SCHEDULE).
 *
 * The schedule is a pg-boss cron (`ladder.pipeline`), fired by the `jobs`
 * worker's timekeeper and consumed here (D4: one scheduler). The pipeline stays
 * in its own process for its own DB pool and failure domain. The data-lifecycle
 * cleanup that used to ride along now runs in the `jobs` worker
 * (`lib/cleanup-job.server.ts`).
 *
 * Runs as a separate Docker service or dev process.
 */

import 'dotenv/config';
import { installProcessGuards } from '../../lib/perf/process-guards';

import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { runPipeline, type RunPrisma } from '../../lib/rmhladder/pipeline/run';
import {
  probeUnconfiguredSources,
  type ProbePrisma,
} from '../../lib/rmhladder/pipeline/probe-sources';
import { seedLadder, type SeedPrisma } from '../../lib/rmhladder/seed/run-seed';
import { isScrapeStale, resolveLadderCron } from '../../lib/rmhladder/scheduler';
import {
  enrichRecentLadderJobs,
  type JobEnrichmentPrisma,
} from '../../lib/rmhladder/ai/enrich-jobs.server';
import {
  refreshConfirmedResumeMatches,
  type ResumePrisma,
} from '../../lib/rmhladder/resume/service.server';
import type { CandidateProfile } from '../../lib/rmhladder/resume/schemas';
import {
  resumeSubsystemReadiness,
  resumeReadinessError,
} from '../../lib/rmhladder/resume/readiness.server';
import { runLadderAlertCycle } from '../../lib/rmhladder/alerts/dispatch.server';
import {
  detectLadderHealthAlerts,
  resolveAlertThresholds,
} from '../../lib/rmhladder/health-alerts';
import {
  acquireWorkerLease,
  heartbeatWorkerLease,
  releaseWorkerLease,
  type WorkerLeasePrisma,
} from '../../lib/rmhladder/worker-lease';
import {
  startScheduledConsumer,
  type ScheduledConsumer,
} from '../../lib/jobs/scheduled-consumer.server';

/** The pg-boss queue (and schedule) the `jobs` worker's timekeeper fires into. */
const LADDER_QUEUE = 'ladder.pipeline';

// Log + count instead of dying on a stray rejection (lib/perf/process-guards.ts).
installProcessGuards({ service: 'ladder-worker' });

// ─── Prisma Client (standalone for worker process) ──────────────

function createPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL required');
  const adapter = new PrismaPg({ connectionString, max: 3 });
  return new PrismaClient({ adapter });
}

const prisma = createPrisma();
// Structural cast, same idiom as the route layer's QueriesPrisma/ActionsPrisma casts:
// RunPrisma narrows generated Prisma signatures to the shapes the pipeline uses.
const runPrisma = prisma as unknown as RunPrisma;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const probeBatchSize = positiveInteger(process.env.LADDER_PROBE_BATCH_SIZE, 10);
const aiEnrichmentBatchSize = positiveInteger(process.env.LADDER_AI_ENRICHMENT_BATCH_SIZE, 25);
const matchRefreshBatchSize = positiveInteger(process.env.LADDER_MATCH_REFRESH_BATCH_SIZE, 10);
const leaseTtlMs = positiveInteger(process.env.LADDER_LEASE_TTL_MS, 30 * 60_000);
const leaseHeartbeatMs = Math.min(
  positiveInteger(process.env.LADDER_LEASE_HEARTBEAT_MS, 5 * 60_000),
  Math.max(1_000, Math.floor(leaseTtlMs / 2)),
);
const workerLease = {
  name: 'rmhladder-pipeline',
  ownerId: `${process.pid}-${randomUUID()}`,
  ttlMs: leaseTtlMs,
};
const leasePrisma = prisma as unknown as WorkerLeasePrisma;
const enrichmentPrisma = prisma as unknown as JobEnrichmentPrisma;
const resumePrisma = prisma as unknown as ResumePrisma;

/** Set once shutdown begins: no new tick (queue run or bootstrap) starts. */
let stopping = false;

/** Docker's default stop grace is 10s; give up waiting on a run well inside it. */
const shutdownDeadlineMs = positiveInteger(process.env.LADDER_SHUTDOWN_DEADLINE_MS, 8_000);

/** Thrown between pipeline steps once the DB lease has been lost. */
class LeaseLostError extends Error {
  constructor() {
    super('database lease lost');
  }
}

// ─── Overlap guard ───────────────────────────────────────────────

let running = false;

async function probeBatch() {
  try {
    const result = await probeUnconfiguredSources(prisma as unknown as ProbePrisma, {
      limit: probeBatchSize,
      log: (line) => console.log(`[ladder-worker] ${line}`),
    });
    console.log(
      `[ladder-worker] Probe batch complete — companies=${result.companiesProbed} activated=${result.sourcesActivated} liveJobs=${result.totalLiveJobs}`,
    );
  } catch (error) {
    // Source discovery must not prevent already-configured sources from refreshing.
    console.error('[ladder-worker] Probe batch failed:', error);
  }
}

async function refreshMatchingAndAlerts() {
  try {
    const enrichment = await enrichRecentLadderJobs(enrichmentPrisma, {
      limit: aiEnrichmentBatchSize,
    });
    console.log(
      `[ladder-worker] Job profiles — attempted=${enrichment.attempted} enriched=${enrichment.enriched} aiSkipped=${enrichment.skipped}`,
    );
  } catch (error) {
    console.error('[ladder-worker] Job profile enrichment failed:', error);
  }

  try {
    // Pull extra rows before filtering to active versions so old immutable
    // versions do not crowd out the currently selected resume for each owner.
    const candidates = await prisma.ladderResumeVersion.findMany({
      where: {
        confirmedAt: { not: null },
        confirmedProfile: { not: Prisma.JsonNull },
        activeFor: { isNot: null },
      },
      include: { resume: { select: { activeVersionId: true } } },
      orderBy: [{ matchesRefreshedAt: { sort: 'asc', nulls: 'first' } }, { confirmedAt: 'asc' }],
      take: matchRefreshBatchSize,
    });
    const activeVersions = candidates.filter(
      (version) => version.resume.activeVersionId === version.id,
    );
    let refreshed = 0;
    for (const version of activeVersions) {
      try {
        await refreshConfirmedResumeMatches(resumePrisma, {
          userId: version.userId,
          versionId: version.id,
          profile: version.confirmedProfile as unknown as CandidateProfile,
        });
        refreshed++;
      } catch (error) {
        console.error(
          `[ladder-worker] Match refresh failed for resume version ${version.id}:`,
          error,
        );
      }
    }
    console.log(
      `[ladder-worker] Resume matches — refreshed=${refreshed} candidates=${activeVersions.length}`,
    );
  } catch (error) {
    console.error('[ladder-worker] Resume match refresh batch failed:', error);
  }

  try {
    const alerts = await runLadderAlertCycle();
    console.log(
      `[ladder-worker] Alerts — generated=${alerts.generated} sent=${alerts.sent} failed=${alerts.failed} skipped=${alerts.skipped}`,
    );
  } catch (error) {
    console.error('[ladder-worker] Alert cycle failed:', error);
  }
}

async function tick() {
  if (stopping) return;
  if (running) {
    console.log('[ladder-worker] Tick skipped — previous run still in flight');
    return;
  }

  running = true;
  let leaseAcquired = false;
  let leaseLost = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  // Another worker may now hold the lease and be running the same pipeline:
  // stop at the next step boundary instead of carrying on in parallel.
  const assertLease = () => {
    if (leaseLost) throw new LeaseLostError();
  };
  try {
    leaseAcquired = await acquireWorkerLease(leasePrisma, workerLease);
    if (!leaseAcquired) {
      console.log('[ladder-worker] Tick skipped — another worker owns the database lease');
      return;
    }
    heartbeat = setInterval(() => {
      void heartbeatWorkerLease(leasePrisma, workerLease)
        .then((renewed) => {
          if (!renewed) {
            leaseLost = true;
            console.error(
              '[ladder-worker] Lost database lease while a run was in flight — stopping after the current step',
            );
          }
        })
        .catch((error) => console.error('[ladder-worker] Lease heartbeat failed:', error));
    }, leaseHeartbeatMs);
    heartbeat.unref();

    // Keep making bounded progress through unconfigured sources on every run.
    await probeBatch();
    assertLease();
    const result = await runPipeline({ prisma: runPrisma }, { trigger: 'cron' });
    console.log(
      `[ladder-worker] Run complete [${result.runId}] — discovered=${result.discovered} created=${result.created} updated=${result.updated} verified=${result.verified} struck=${result.struck} expired=${result.expired} errors=${result.errors} reviewTasks=${result.reviewTasks} durationMs=${result.durationMs}`,
    );
    assertLease();
    await refreshMatchingAndAlerts();
    assertLease();
    try {
      const lastRun = await prisma.ladderScrapeRun.findFirst({
        where: { finishedAt: { not: null } },
        orderBy: { finishedAt: 'desc' },
        select: { finishedAt: true, errorCount: true, discoveredCount: true },
      });
      const openMassExpiryTasks = await prisma.ladderReviewTask.count({
        where: { reason: 'mass_expiry_suspected', status: 'open' },
      });
      const alerts = detectLadderHealthAlerts({
        now: new Date(),
        lastCompletedRunAt: lastRun?.finishedAt ?? null,
        latestRun: lastRun
          ? { errorCount: lastRun.errorCount ?? 0, discoveredCount: lastRun.discoveredCount ?? 0 }
          : null,
        openMassExpiryTasks,
        resumeReady: resumeSubsystemReadiness().ready,
        thresholds: resolveAlertThresholds(),
      });
      for (const a of alerts)
        console.error(`[ladder-worker] HEALTH ALERT [${a.severity}] ${a.code}: ${a.message}`);
    } catch (error) {
      console.error('[ladder-worker] Alert detection failed:', error);
    }
  } catch (e) {
    if (e instanceof LeaseLostError) {
      console.error('[ladder-worker] Run stopped — database lease lost');
    } else {
      console.error('[ladder-worker] Run failed:', e);
    }
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    // Release is owner-scoped, so it is a no-op if the lease was lost.
    if (leaseAcquired) {
      await releaseWorkerLease(leasePrisma, workerLease).catch((error) =>
        console.error('[ladder-worker] Lease release failed:', error),
      );
    }
    running = false;
  }
}

// ─── Startup bootstrap ──────────────────────────────────────────
// A fresh database has no companies/sources/jobs, and the first cron tick can
// be hours away — self-initialize so the dashboard has postings right after
// deploy: seed if empty, make bounded progress probing sources, and run the
// pipeline immediately when there is no completed run or the latest completed
// run is at least four hours old. Every step is idempotent.

async function bootstrap(): Promise<boolean> {
  if (running || stopping) return false;
  running = true;
  let runImmediately = false;
  try {
    const companyCount = await prisma.ladderCompany.count();
    if (companyCount === 0) {
      console.log('[ladder-worker] Bootstrap: empty database — seeding companies/sources/rules');
      const seeded = await seedLadder(prisma as unknown as SeedPrisma);
      console.log(
        `[ladder-worker] Bootstrap: seeded ${seeded.companies} companies, ${seeded.sources} sources`,
      );
    }

    const latestCompletedRun = await prisma.ladderScrapeRun.findFirst({
      where: { finishedAt: { not: null } },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true },
    });
    const activeJobs = await prisma.ladderJob.count({ where: { status: 'active' } });
    runImmediately = activeJobs === 0 || isScrapeStale(latestCompletedRun?.finishedAt);

    if (runImmediately) {
      console.log(
        `[ladder-worker] Bootstrap: ${activeJobs === 0 ? 'no active jobs' : 'latest completed scrape is stale'} — running pipeline now`,
      );
    } else {
      // A fresh scrape needs no repeat pipeline run, but source discovery must
      // continue across deployments and worker restarts.
      await probeBatch();
    }
  } catch (e) {
    console.error('[ladder-worker] Bootstrap failed:', e);
  } finally {
    running = false;
  }
  return runImmediately;
}

// ─── Scheduler ──────────────────────────────────────────────────
// The cron lives in pg-boss (queue `ladder.pipeline`, fired by the jobs worker's
// timekeeper, evaluated in UTC); this process consumes it. `exclusive` keeps one
// run queued or active, the DB lease still guards against pg-boss handing a run
// out again after `expireInSeconds` while the first is somehow still going.

const cronSchedule = resolveLadderCron(process.env.LADDER_CRON_SCHEDULE);
let consumer: ScheduledConsumer | null = null;

async function main() {
  const runImmediately = await bootstrap();
  if (stopping) return;

  consumer = await startScheduledConsumer({
    queue: LADDER_QUEUE,
    cron: cronSchedule,
    // The pipeline has no wall-clock bound of its own; the lease heartbeat is what proves it is alive.
    expireInSeconds: 6 * 60 * 60,
    // tick() catches everything, so a throw is a bug and a retry would only repeat it.
    retryLimit: 0,
    handler: tick,
    shouldStop: () => stopping,
    log: { warn: (line) => console.warn(line), error: (line) => console.error(line) },
  });
  if (!consumer) {
    if (stopping) return;
    console.error('[ladder-worker] pg-boss unavailable — exiting so the container restarts');
    process.exit(1);
  }
  if (stopping) {
    await consumer.pause();
    return;
  }

  console.log(
    `[ladder-worker] Started — schedule="${cronSchedule}" queue="${LADDER_QUEUE}" timezone="UTC" probeBatchSize=${probeBatchSize} aiEnrichmentBatchSize=${aiEnrichmentBatchSize} matchRefreshBatchSize=${matchRefreshBatchSize} leaseTtlMs=${leaseTtlMs}`,
  );
  // The bootstrap decided a run is due now (empty or stale): enqueue it like a cron tick.
  if (runImmediately) await consumer.runNow();
}

const resumeReady = resumeSubsystemReadiness();
if (resumeReady.ready) {
  console.log(
    '[ladder-worker] Resume subsystem ready — object storage + encryption key configured',
  );
} else {
  console.error(`[ladder-worker] ${resumeReadinessError(resumeReady)}`);
}

main().catch((e) => {
  console.error('[ladder-worker] fatal:', e);
  process.exit(1);
});

// ─── Graceful shutdown ──────────────────────────────────────────

async function shutdown(signal: string) {
  // Re-entrant: a second signal must not stop the consumer / start a second wait.
  if (stopping) return;
  stopping = true;
  console.log(`[ladder-worker] ${signal} received, shutting down...`);

  await consumer?.pause();

  if (running) {
    console.log('[ladder-worker] Waiting for in-flight run to complete...');
    const drained = await new Promise<boolean>((resolve) => {
      const deadline = setTimeout(() => {
        clearInterval(interval);
        resolve(false);
      }, shutdownDeadlineMs);
      const interval = setInterval(() => {
        if (!running) {
          clearInterval(interval);
          clearTimeout(deadline);
          resolve(true);
        }
      }, 500);
    });
    if (!drained) {
      // The run dies with the process; hand the lease back now so the next
      // worker does not sit out the whole TTL. Owner-scoped, so safe.
      console.error(
        `[ladder-worker] In-flight run did not finish within ${shutdownDeadlineMs}ms — exiting anyway`,
      );
      await releaseWorkerLease(leasePrisma, workerLease).catch(() => undefined);
    }
  }

  await consumer?.stop();
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
