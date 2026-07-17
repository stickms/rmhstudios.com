/* eslint-disable no-console */
/**
 * Ladder Worker — Background Cron Process
 *
 * Long-lived Node.js process that runs the job-discovery pipeline
 * on a configurable schedule (default: every 4 hours).
 *
 * Runs as a separate Docker service or dev process.
 */

import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { schedule } from 'node-cron';
import type { ScheduledTask } from 'node-cron';
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
  if (running) {
    console.log('[ladder-worker] Tick skipped — previous run still in flight');
    return;
  }

  running = true;
  let leaseAcquired = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    leaseAcquired = await acquireWorkerLease(leasePrisma, workerLease);
    if (!leaseAcquired) {
      console.log('[ladder-worker] Tick skipped — another worker owns the database lease');
      return;
    }
    heartbeat = setInterval(() => {
      void heartbeatWorkerLease(leasePrisma, workerLease)
        .then((renewed) => {
          if (!renewed)
            console.error('[ladder-worker] Lost database lease while a run was in flight');
        })
        .catch((error) => console.error('[ladder-worker] Lease heartbeat failed:', error));
    }, leaseHeartbeatMs);
    heartbeat.unref();

    // Keep making bounded progress through unconfigured sources on every run.
    await probeBatch();
    const result = await runPipeline({ prisma: runPrisma }, { trigger: 'cron' });
    console.log(
      `[ladder-worker] Run complete [${result.runId}] — discovered=${result.discovered} created=${result.created} updated=${result.updated} verified=${result.verified} struck=${result.struck} expired=${result.expired} errors=${result.errors} reviewTasks=${result.reviewTasks} durationMs=${result.durationMs}`,
    );
    await refreshMatchingAndAlerts();
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
    console.error('[ladder-worker] Run failed:', e);
  } finally {
    if (heartbeat) clearInterval(heartbeat);
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

async function bootstrap() {
  if (running) return;
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

  if (runImmediately) await tick();
}

// ─── Scheduler ──────────────────────────────────────────────────

const cronSchedule = resolveLadderCron(process.env.LADDER_CRON_SCHEDULE);

const task: ScheduledTask = schedule(cronSchedule, tick, {
  timezone: 'UTC',
  noOverlap: true,
});

console.log(
  `[ladder-worker] Started — schedule="${cronSchedule}" timezone="UTC" probeBatchSize=${probeBatchSize} aiEnrichmentBatchSize=${aiEnrichmentBatchSize} matchRefreshBatchSize=${matchRefreshBatchSize} leaseTtlMs=${leaseTtlMs}`,
);
const resumeReady = resumeSubsystemReadiness();
if (resumeReady.ready) {
  console.log(
    '[ladder-worker] Resume subsystem ready — object storage + encryption key configured',
  );
} else {
  console.error(`[ladder-worker] ${resumeReadinessError(resumeReady)}`);
}

void bootstrap();

// ─── Graceful shutdown ──────────────────────────────────────────

async function shutdown(signal: string) {
  console.log(`[ladder-worker] ${signal} received, shutting down...`);

  await task.stop();

  if (running) {
    console.log('[ladder-worker] Waiting for in-flight run to complete...');
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (!running) {
          clearInterval(interval);
          resolve();
        }
      }, 500);
    });
  }

  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
