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
import { runPipeline } from '../../lib/rmhladder/pipeline/run';

// ─── Prisma Client (standalone for worker process) ──────────────

function createPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL required');
  const adapter = new PrismaPg({ connectionString, max: 3 });
  return new PrismaClient({ adapter });
}

const prisma = createPrisma();

// ─── Overlap guard ───────────────────────────────────────────────

let running = false;

async function tick() {
  if (running) {
    console.log('[ladder-worker] Tick skipped — previous run still in flight');
    return;
  }

  running = true;
  try {
    const result = await runPipeline({ prisma }, { trigger: 'cron' });
    console.log(
      `[ladder-worker] Run complete [${result.runId}] — discovered=${result.discovered} created=${result.created} updated=${result.updated} verified=${result.verified} struck=${result.struck} expired=${result.expired} errors=${result.errors} reviewTasks=${result.reviewTasks} durationMs=${result.durationMs}`,
    );
  } catch (e) {
    console.error('[ladder-worker] Run failed:', e);
  } finally {
    running = false;
  }
}

// ─── Scheduler ──────────────────────────────────────────────────

const cronSchedule = process.env.LADDER_CRON_SCHEDULE ?? '0 */6 * * *';

const task: ScheduledTask = schedule(cronSchedule, tick);

console.log(`[ladder-worker] Started — schedule="${cronSchedule}"`);

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
