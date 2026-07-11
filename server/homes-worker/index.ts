/* eslint-disable no-console */
/**
 * Homes Worker — Background Cron Process
 *
 * Long-lived Node.js process that runs the RMHHomes scraper on a configurable
 * schedule (default: every 6 hours). It aggregates public housing/apartment
 * feeds (Craigslist regional RSS, generic RSS) into EXTERNAL HomeListing rows so
 * the marketplace has real inventory beyond member posts.
 *
 * Runs as a separate Docker service or dev process, alongside the ladder-worker.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { schedule } from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { runHomesScrape, type RunPrisma } from '../../lib/homes/scrape/run';
import { seedHomeSources, type SeedPrisma } from '../../lib/homes/scrape/seed';
import {
  notifyWatchersOfExternalListing,
  type NotifyPrisma,
} from '../../lib/homes/scrape/notify.server';

// ─── Prisma Client (standalone for worker process) ──────────────

function createPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL required');
  const adapter = new PrismaPg({ connectionString, max: 3 });
  return new PrismaClient({ adapter });
}

const prisma = createPrisma();
// Structural cast, same idiom as the ladder-worker: RunPrisma narrows the
// generated Prisma signatures to the shapes the pipeline actually uses.
const runPrisma = prisma as unknown as RunPrisma;
const notifyPrisma = prisma as unknown as NotifyPrisma;

// Whether scraping is enabled at all (operators can disable via env).
const SCRAPE_ENABLED = process.env.HOMES_SCRAPE_ENABLED !== 'false';

// ─── Overlap guard ───────────────────────────────────────────────

let running = false;

async function tick() {
  if (!SCRAPE_ENABLED) return;
  if (running) {
    console.log('[homes-worker] Tick skipped — previous run still in flight');
    return;
  }

  running = true;
  try {
    const result = await runHomesScrape(
      {
        prisma: runPrisma,
        onNewListing: (id) => notifyWatchersOfExternalListing(notifyPrisma, id),
      },
      { trigger: 'CRON' },
    );
    console.log(
      `[homes-worker] Run complete [${result.runId}] — sources=${result.sources} discovered=${result.discovered} created=${result.created} updated=${result.updated} expired=${result.expired} errors=${result.errors} durationMs=${result.durationMs}`,
    );
  } catch (e) {
    console.error('[homes-worker] Run failed:', e);
  } finally {
    running = false;
  }
}

// ─── Startup bootstrap ──────────────────────────────────────────
// A fresh database has no sources or external listings, and the first cron tick
// can be hours away — self-initialize so the marketplace has inventory right
// after deploy: seed default sources if none exist, then run once if there are
// no external listings yet. Every step is idempotent and skipped once done.

async function bootstrap() {
  if (!SCRAPE_ENABLED || running) return;
  running = true;
  try {
    const sourceCount = await prisma.homeSource.count();
    if (sourceCount === 0) {
      console.log('[homes-worker] Bootstrap: no sources — seeding default feeds');
      const seeded = await seedHomeSources(prisma as unknown as SeedPrisma);
      console.log(`[homes-worker] Bootstrap: seeded ${seeded.sources} sources`);
    }

    const externalCount = await prisma.homeListing.count({ where: { source: 'EXTERNAL' } });
    if (externalCount === 0) {
      console.log('[homes-worker] Bootstrap: no external listings — running scrape now');
      running = false; // hand the overlap guard to tick()
      await tick();
      return;
    }
  } catch (e) {
    console.error('[homes-worker] Bootstrap failed:', e);
  } finally {
    running = false;
  }
}

// ─── Scheduler ──────────────────────────────────────────────────

const cronSchedule = process.env.HOMES_CRON_SCHEDULE ?? '0 */6 * * *';

const task: ScheduledTask = schedule(cronSchedule, tick);

console.log(`[homes-worker] Started — schedule="${cronSchedule}" enabled=${SCRAPE_ENABLED}`);

void bootstrap();

// ─── Graceful shutdown ──────────────────────────────────────────

async function shutdown(signal: string) {
  console.log(`[homes-worker] ${signal} received, shutting down...`);

  await task.stop();

  if (running) {
    console.log('[homes-worker] Waiting for in-flight run to complete...');
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
