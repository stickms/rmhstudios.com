/**
 * A pg-boss cron whose handler runs in its OWN worker process (redesign D4: one scheduler).
 *
 * The ladder pipeline and the homes scraper stay in their own containers (their own small Prisma
 * pools, memory and failure domain; the pipeline runs for minutes and calls out to many hosts), but
 * they no longer run a private node-cron. They register their queue and schedule here and consume
 * it; the `jobs` worker is the only process that runs pg-boss maintenance and the timekeeper that
 * turns the schedule row into a job, so there is one scheduler and one place a missed or stuck run
 * shows up (the pg-boss job table the status service already reads).
 *
 * `schedule()` and `work()` only need a normal pg-boss connection, so this uses the memoised
 * producer instance (`getBoss()`, no supervision, tiny pool). Calling `schedule()` on every boot
 * is an upsert by queue name, so a changed cron in the environment takes effect on the next start.
 */
import type { PgBoss } from 'pg-boss';
import { getBoss } from '@/lib/jobs/boss.server';

/** Boot attempts after the first, and the gap between them (just over RETRY_AFTER_MS in boss.server.ts). */
const BOOT_RETRIES = 3;
const BOOT_RETRY_MS = 31_000;

/** Structural subset of createQueue options this helper forwards. */
export interface ScheduledConsumerOptions {
  /** pg-boss queue name. */
  queue: string;
  /** 5-field cron, evaluated in UTC. Invalid input makes pg-boss `schedule()` throw. */
  cron: string;
  /** Seconds a single run may take before pg-boss marks it failed. Size it well above a real run. */
  expireInSeconds: number;
  /** Retries after a thrown handler. Runs catch their own errors, so this is normally 0. */
  retryLimit: number;
  /** How often to poll for a due run. The cadence is hours, so 30 s costs nothing. */
  pollingIntervalSeconds?: number;
  /** The run. Must not throw for expected failures (log and return). */
  handler: () => Promise<void>;
  /** Return true to abandon boot (a shutdown signal arrived while waiting for Postgres). */
  shouldStop?: () => boolean;
  log: { warn(line: string): void; error(line: string): void };
}

export interface ScheduledConsumer {
  boss: PgBoss;
  /** Enqueue a run now (a no-op while one is already queued or active: the queue is `exclusive`). */
  runNow(): Promise<void>;
  /** Stop taking new runs. Does not wait for the one in flight. */
  pause(): Promise<void>;
  /** Stop pg-boss itself (call after the in-flight run has drained). */
  stop(): Promise<void>;
}

/**
 * Create the queue, schedule the cron and start consuming. Resolves to `null` when pg-boss cannot
 * start after the boot retries (the caller decides: both workers exit so Docker restarts them).
 */
export async function startScheduledConsumer(
  opts: ScheduledConsumerOptions,
): Promise<ScheduledConsumer | null> {
  let boss = await getBoss();
  for (let attempt = 1; !boss && process.env.DATABASE_URL && attempt <= BOOT_RETRIES; attempt++) {
    if (opts.shouldStop?.()) return null;
    opts.log.warn(`[${opts.queue}] pg-boss start failed; retry ${attempt}/${BOOT_RETRIES}`);
    await new Promise((resolve) => setTimeout(resolve, BOOT_RETRY_MS));
    boss = await getBoss();
  }
  if (!boss) return null;
  const started: PgBoss = boss;

  // exclusive: at most one run queued or active however many consumers exist. This replaces the
  // in-process `running` flag and node-cron's `noOverlap`.
  await started.createQueue(opts.queue, {
    policy: 'exclusive',
    retryLimit: opts.retryLimit,
    expireInSeconds: opts.expireInSeconds,
  });
  await started.schedule(opts.queue, opts.cron, {}, { tz: 'UTC' });
  await started.work(
    opts.queue,
    { pollingIntervalSeconds: opts.pollingIntervalSeconds ?? 30 },
    async () => {
      try {
        await opts.handler();
      } catch (error) {
        // A tick owns its errors; this is the backstop so a bug never turns into a retry storm.
        opts.log.error(
          `[${opts.queue}] run threw: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  return {
    boss: started,
    runNow: async () => {
      await started.send(opts.queue, {}).catch(() => undefined);
    },
    pause: async () => {
      await started.offWork(opts.queue, { wait: false }).catch(() => undefined);
    },
    stop: async () => {
      await started.stop({ graceful: false }).catch(() => undefined);
    },
  };
}
