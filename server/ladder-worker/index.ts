/* eslint-disable no-console */
/**
 * Ladder Worker — Background Cron Process
 *
 * Long-lived Node.js process that runs the job-discovery pipeline
 * on a configurable schedule (default: every 6 hours).
 *
 * Runs as a separate Docker service or dev process.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { schedule } from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { runPipeline, type RunPrisma } from '../../lib/rmhladder/pipeline/run';
import { probeUnconfiguredSources, type ProbePrisma } from '../../lib/rmhladder/pipeline/probe-sources';
import { seedLadder, type SeedPrisma } from '../../lib/rmhladder/seed/run-seed';

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

// ─── Overlap guard ───────────────────────────────────────────────

let running = false;

async function tick() {
  if (running) {
    console.log('[ladder-worker] Tick skipped — previous run still in flight');
    return;
  }

  running = true;
  try {
    const result = await runPipeline({ prisma: runPrisma }, { trigger: 'cron' });
    console.log(
      `[ladder-worker] Run complete [${result.runId}] — discovered=${result.discovered} created=${result.created} updated=${result.updated} verified=${result.verified} struck=${result.struck} expired=${result.expired} errors=${result.errors} reviewTasks=${result.reviewTasks} durationMs=${result.durationMs}`,
    );
  } catch (e) {
    console.error('[ladder-worker] Run failed:', e);
  } finally {
    running = false;
  }
}

// ─── Startup bootstrap ──────────────────────────────────────────
// A fresh database has no companies/sources/jobs, and the first cron tick can
// be hours away — self-initialize so the dashboard has postings right after
// deploy: seed if empty, probe sources if none are active, run the pipeline
// if there are no active jobs. Every step is idempotent and skipped once done.

async function bootstrap() {
  if (running) return;
  running = true;
  try {
    const companyCount = await prisma.ladderCompany.count();
    if (companyCount === 0) {
      console.log('[ladder-worker] Bootstrap: empty database — seeding companies/sources/rules');
      const seeded = await seedLadder(prisma as unknown as SeedPrisma);
      console.log(`[ladder-worker] Bootstrap: seeded ${seeded.companies} companies, ${seeded.sources} sources`);
    }

    // Manual sources are seeded 'active', so gate the probe on API sources only.
    const activeApiSources = await prisma.ladderSource.count({
      where: { status: 'active', platform: { not: 'manual' } },
    });
    if (activeApiSources === 0) {
      console.log('[ladder-worker] Bootstrap: no active API sources — probing board slugs (this takes a while)');
      const probed = await probeUnconfiguredSources(prisma as unknown as ProbePrisma, {
        log: (line) => console.log(`[ladder-worker] ${line}`),
      });
      console.log(
        `[ladder-worker] Bootstrap: probed ${probed.companiesProbed} companies, activated ${probed.sourcesActivated} sources`,
      );
    }

    const activeJobs = await prisma.ladderJob.count({ where: { status: 'active' } });
    if (activeJobs === 0) {
      console.log('[ladder-worker] Bootstrap: no active jobs — running pipeline now');
      running = false; // hand the overlap guard to tick()
      await tick();
      return;
    }
  } catch (e) {
    console.error('[ladder-worker] Bootstrap failed:', e);
  } finally {
    running = false;
  }
}

// ─── Scheduler ──────────────────────────────────────────────────

const cronSchedule = process.env.LADDER_CRON_SCHEDULE ?? '0 */6 * * *';

const task: ScheduledTask = schedule(cronSchedule, tick);

console.log(`[ladder-worker] Started — schedule="${cronSchedule}"`);

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
