/* eslint-disable no-console */
/**
 * Med Schools Worker — CycleTrack ingest consumer
 *
 * Long-lived Node.js process that keeps RMH Med Schools' admissions-cycle counts current. Two pg-boss
 * crons are fired by the `jobs` worker's timekeeper and consumed here (D4: one scheduler):
 *
 *   medschools.cycletrack  hourly at :20 — diff every school's current counts, write what changed.
 *   medschools.backfill    a yearly no-op safety net. A cron is mandatory for a queue, and a finished
 *                          backfill records an OK no-op; the real backfill is queued by the bootstrap
 *                          below, and resumes from its own cursor after any interruption.
 *
 *   medschools.admit-live   every 5 min — the Admit.org live decisions feed (needs the dedupe secret).
 *   medschools.interviews   daily — Admit interview profiles, questions and school stats (same).
 *
 * The two CycleTrack jobs share ONE polite host (`createPoliteHost(SOURCES.CYCLETRACK)`), which is what makes them
 * mutually exclusive against CycleTrack: one request at a time at the configured rate, one halt flag.
 * The two Admit jobs share their own host (`createPoliteHost(SOURCES.ADMIT)`), independent of CycleTrack.
 *
 * Runs as a separate Docker service or dev process, alongside the ladder-worker and homes-worker.
 */

import 'dotenv/config';
import { installProcessGuards } from '../../lib/perf/process-guards';

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  startScheduledConsumer,
  type ScheduledConsumer,
} from '../../lib/jobs/scheduled-consumer.server';
import schoolsJson from '../../data/medschools/schools.json';
import cyclesJson from '../../data/medschools/cycles.json';
import { createPoliteHost } from '../../features/medschools/scrape/http';
import { runAdmitLive } from '../../features/medschools/scrape/run-admit-live';
import { runAdmitInterviews } from '../../features/medschools/scrape/run-admit-interviews';
import admitAliasesJson from '../../data/medschools/admit-aliases.json';
import { SOURCES } from '../../features/medschools/scrape/sources';
import { runCycletrack } from '../../features/medschools/scrape/run-cycletrack';
import {
  needsBackfill,
  runBackfill,
} from '../../features/medschools/scrape/run-backfill';
import {
  seedAdmitAliases,
  seedAdmitIgnoredMisses,
  type AdmitAliasFile,
  seedCycles,
  seedRegistryIfEmpty,
  type CycleSeed,
  type RegistryFile,
} from '../../features/medschools/scrape/registry';
import type {
  Logger,
  MedPrisma,
} from '../../features/medschools/scrape/types';

const TAG =
  'medschools-worker';

// Log + count instead of dying on a stray rejection (lib/perf/process-guards.ts).
installProcessGuards(
  {
    service:
      TAG,
  },
);

// ─── Prisma Client (standalone for worker process) ──────────────

function createPrisma() {
  const connectionString =
    process
      .env
      .DATABASE_URL;
  if (
    !connectionString
  )
    throw new Error(
      'DATABASE_URL required',
    );
  const adapter =
    new PrismaPg(
      {
        connectionString,
        max: 3,
      },
    );
  return new PrismaClient(
    {
      adapter,
    },
  );
}

const prisma =
  createPrisma();
// Structural cast, same idiom as the ladder-worker and homes-worker: MedPrisma narrows the generated
// Prisma signatures to the shapes the pipeline actually uses.
const medPrisma =
  prisma as unknown as MedPrisma;
type SeedClient =
  Parameters<
    typeof seedRegistryIfEmpty
  >[0];
const seedPrisma =
  prisma as unknown as SeedClient;

// Operators can turn the hourly queue and the bootstrap backfill off with env.
const CYCLETRACK_ENABLED =
  process
    .env
    .MEDSCHOOLS_CYCLETRACK_ENABLED !==
  'false';

// R12-style flag for both Admit crons. Only an explicit manual runNow({ manual: true }) bypasses it.
const ADMIT_ENABLED =
  process.env.MEDSCHOOLS_ADMIT_ENABLED !== 'false';

/** The dedupe hashes are keyed with this; an Admit job without it would store unkeyed, guessable hashes. */
const secretOk = () =>
  (process.env.MEDSCHOOLS_DEDUPE_SECRET ?? '').length >= 16;

/** Docker's default stop grace is 10s; give up waiting on a run well inside it. */
const SHUTDOWN_DEADLINE_MS =
  (() => {
    const n =
      Number(
        process
          .env
          .MEDSCHOOLS_SHUTDOWN_DEADLINE_MS,
      );
    return Number.isInteger(
      n,
    ) &&
      n >
        0
      ? n
      : 8_000;
  })();

const log: Logger =
  {
    info: (
      l,
    ) =>
      console.log(
        `[${TAG}] ${l}`,
      ),
    warn: (
      l,
    ) =>
      console.warn(
        `[${TAG}] ${l}`,
      ),
    error:
      (
        l,
      ) =>
        console.error(
          `[${TAG}] ${l}`,
        ),
  };

// ─── Run state ──────────────────────────────────────────────────

/** Set once shutdown begins: no new run (cron or bootstrap) starts, and a run in flight winds down. */
let stopping = false;

/** Every run in flight; shutdown waits on these (bounded) before stopping pg-boss. */
const inFlight =
  new Set<
    Promise<void>
  >();

// One host for both jobs: they take turns on CycleTrack's rate budget instead of doubling it.
const cycletrackHost =
  createPoliteHost(
    SOURCES.CYCLETRACK,
  );

// One host for both Admit jobs, separate from CycleTrack's. FIFO: while the daily interviews walk
// (~600 requests) runs, live requests interleave one-for-one, so a live tick can run long and the
// inFlight guard may drop the next one. Accepted; the live feed's 6 h window absorbs it.
const admitHost =
  createPoliteHost(
    SOURCES.ADMIT,
  );

/** Wraps a job so a second concurrent call is skipped, and so shutdown can await it. */
function guarded(
  name: string,
  run: (
    data: Record<
      string,
      unknown
    >,
  ) => Promise<void>,
): (
  data?: Record<
    string,
    unknown
  >,
) => Promise<void> {
  let running = false;
  return async (
    data = {},
  ) => {
    if (
      stopping
    )
      return;
    if (
      running
    ) {
      log.info(
        `${name} tick skipped — previous run still in flight`,
      );
      return;
    }
    running = true;
    const p =
      (async () => {
        try {
          await run(data);
        } catch (e) {
          log.error(
            `${name} run failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      })();
    inFlight.add(
      p,
    );
    try {
      await p;
    } finally {
      inFlight.delete(
        p,
      );
      running = false;
    }
  };
}

/** True while a backfill run is executing in this process (the hourly tick must not queue another). */
let backfillInFlight = false;

const cycletrackTick =
  guarded(
    'cycletrack',
    async () => {
      if (
        !CYCLETRACK_ENABLED
      )
        return;
      const r =
        await runCycletrack(
          {
            prisma:
              medPrisma,
            host: cycletrackHost,
            shouldStop:
              () =>
                stopping,
            log,
          },
          {
            trigger:
              'CRON',
          },
        );
      log.info(
        `cycletrack run complete [${r.runId}] — status=${r.status} schools=${r.schools} created=${r.created} updated=${r.updated} deleted=${r.deleted} misses=${r.misses} requests=${r.requests}`,
      );
      // A halted or partial backfill resumes here, without waiting for a restart or the yearly cron.
      // The queue is exclusive and the backfill tick guarded, so a second queueing is a no-op.
      if (
        !stopping &&
        !backfillInFlight
      ) {
        try {
          if (
            await needsBackfill(
              medPrisma,
            )
          ) {
            log.info(
              'cycletrack: backfill not complete — queueing it',
            );
            await backfillConsumer?.runNow();
          }
        } catch (e) {
          log.warn(
            `cycletrack: backfill check failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    },
  );

const backfillTick =
  guarded(
    'backfill',
    async (
      data,
    ) => {
      // R12: the flag disables the hourly run, the bootstrap and the yearly cron backfill; only an
      // explicit manual runNow ({ manual: true }) bypasses it.
      if (
        !CYCLETRACK_ENABLED &&
        data.manual !==
          true
      )
        return;
      backfillInFlight = true;
      try {
        const r =
          await runBackfill(
            {
              prisma:
                medPrisma,
              cycletrack:
                cycletrackHost,
              shouldStop:
                () =>
                  stopping,
              log,
            },
            {
              trigger:
                'CRON',
            },
          );
        log.info(
          `backfill run complete [${r.runId}] — status=${r.status} stage=${r.cursor.stage} schools=${r.schools} created=${r.created} updated=${r.updated} requests=${r.requests}`,
        );
      } finally {
        backfillInFlight = false;
      }
    },
  );

/** Shared gate for both Admit ticks: the flag first (manual bypasses), then the secret (never bypassed). */
function admitGate(
  name: string,
  data: Record<string, unknown>,
): boolean {
  if (!ADMIT_ENABLED && data.manual !== true) return false;
  if (!secretOk()) {
    log.error(
      `${name}: MEDSCHOOLS_DEDUPE_SECRET is unset or shorter than 16 characters — run refused`,
    );
    return false;
  }
  return true;
}

const admitLiveTick =
  guarded(
    'admit-live',
    async (data) => {
      if (!admitGate('admit-live', data)) return;
      const r = await runAdmitLive(
        {
          prisma: medPrisma,
          host: admitHost,
          secret: process.env.MEDSCHOOLS_DEDUPE_SECRET ?? '',
          shouldStop: () => stopping,
          log,
        },
        { trigger: data.manual === true ? 'MANUAL' : 'CRON' },
      );
      log.info(
        `admit-live run complete [${r.runId}] — status=${r.status} fetched=${r.fetched} created=${r.created} alreadyStored=${r.alreadyStored} deferred=${r.deferred} programNull=${r.programNull} misses=${r.misses} lookups=${r.lookups} rolledUp=${r.rolledUp} requests=${r.requests}`,
      );
    },
  );

const interviewsTick =
  guarded(
    'interviews',
    async (data) => {
      if (!admitGate('interviews', data)) return;
      const r = await runAdmitInterviews(
        {
          prisma: medPrisma,
          host: admitHost,
          secret: process.env.MEDSCHOOLS_DEDUPE_SECRET ?? '',
          shouldStop: () => stopping,
          log,
        },
        { trigger: data.manual === true ? 'MANUAL' : 'CRON' },
      );
      log.info(
        `interviews run complete [${r.runId}] — status=${r.status} statsRows=${r.statsRows} schoolsFetched=${r.schoolsFetched} schoolsSkipped=${r.schoolsSkipped} schoolsFailed=${r.schoolsFailed} schoolsUnavailable=${r.schoolsUnavailable} questionsCreated=${r.questionsCreated} questionsUpdated=${r.questionsUpdated} questionsDeleted=${r.questionsDeleted} misses=${r.misses} requests=${r.requests}`,
      );
    },
  );

// ─── Startup bootstrap ──────────────────────────────────────────
// A fresh database has no schools and no history, and the first hourly tick can be most of an hour
// away. Seed the registry and cycle dates (both idempotent and converging, from JSON that esbuild
// inlines so the runtime image needs no data lookup), then say whether the backfill is still owed.

/** Resolves true when the backfill has not completed, so the hourly run should be queued now. */
async function bootstrap(): Promise<boolean> {
  try {
    const cycles =
      await seedCycles(
        seedPrisma,
        cyclesJson as CycleSeed[],
      );
    const seeded =
      await seedRegistryIfEmpty(
        seedPrisma,
        schoolsJson as RegistryFile,
      );
    log.info(
      `Bootstrap: seeded ${seeded.schools} schools, ${seeded.aliases} aliases, ${cycles} cycles`,
    );
    // Own try/catch: an Admit seed failure must never stop CycleTrack's backfill-due result below.
    // Alias seeding is deliberately not gated by ADMIT_ENABLED: it is idempotent, queues no request,
    // and the admin page needs the aliases. A conflicting pair is skipped, never moved, and named here.
    try {
      const admit = await seedAdmitAliases(seedPrisma, admitAliasesJson as AdmitAliasFile);
      log.info(
        `Bootstrap: seeded ${admit.created} Admit aliases (${admit.unmatched.length} unmatched)`,
      );
      const ignoredMisses = await seedAdmitIgnoredMisses(seedPrisma, admitAliasesJson as AdmitAliasFile);
      if (ignoredMisses > 0) log.info(`Bootstrap: pre-ignored ${ignoredMisses} unmapped Admit slugs`);
      if (admit.skipped.length > 0) {
        log.warn(
          `Bootstrap: ${admit.skipped.length} Admit alias pairs skipped (conflict): ${admit.skipped.map((p) => `${p.cycletrackKey} -> ${p.admitSlug}`).join('; ')}`,
        );
      }
    } catch (e) {
      log.error(
        `Bootstrap: Admit alias seed failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return (
      CYCLETRACK_ENABLED &&
      !stopping &&
      (await needsBackfill(
        medPrisma,
      ))
    );
  } catch (e) {
    log.error(
      `Bootstrap failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return false;
  }
}

// ─── Scheduler ──────────────────────────────────────────────────
// The crons live in pg-boss (evaluated in UTC); this process consumes them. Each queue is
// `exclusive`, so one run is queued or active at a time across processes.

const CYCLETRACK_QUEUE =
  'medschools.cycletrack';
const BACKFILL_QUEUE =
  'medschools.backfill';
const cycletrackCron =
  process.env.MEDSCHOOLS_CYCLETRACK_CRON?.trim() ||
  '20 * * * *';
const ADMIT_LIVE_QUEUE = 'medschools.admit-live';
const INTERVIEWS_QUEUE = 'medschools.interviews';
const admitLiveCron =
  process.env.MEDSCHOOLS_ADMIT_LIVE_CRON?.trim() || '*/5 * * * *';
const interviewsCron =
  process.env.MEDSCHOOLS_INTERVIEWS_CRON?.trim() || '35 4 * * *';
// Yearly no-op safety net: a finished backfill records an OK no-op, an unfinished one resumes.
const BACKFILL_CRON =
  '0 0 1 1 *';

let cycletrackConsumer: ScheduledConsumer | null =
  null;
let backfillConsumer: ScheduledConsumer | null =
  null;
let admitLiveConsumer: ScheduledConsumer | null =
  null;
let interviewsConsumer: ScheduledConsumer | null =
  null;

async function main() {
  // The Admit jobs hash dedupe keys with this and refuse to run without it; CycleTrack never reads it.
  if (!secretOk()) {
    log.error(
      'MEDSCHOOLS_DEDUPE_SECRET is unset or shorter than 16 characters — the Admit jobs (admit-live, interviews) are disabled; CycleTrack is unaffected. Set it with: openssl rand -hex 32',
    );
  }

  const backfillDue =
    await bootstrap();
  if (
    stopping
  )
    return;

  const consumerLog =
    {
      warn: log.warn,
      error:
        log.error,
    };
  cycletrackConsumer =
    await startScheduledConsumer(
      {
        queue:
          CYCLETRACK_QUEUE,
        cron: cycletrackCron,
        expireInSeconds:
          2 *
          60 *
          60,
        // The tick catches everything, so a throw is a bug and a retry would only repeat it.
        retryLimit: 0,
        handler:
          cycletrackTick,
        shouldStop:
          () =>
            stopping,
        log: consumerLog,
      },
    );
  if (
    !cycletrackConsumer
  ) {
    if (
      stopping
    )
      return;
    log.error(
      'pg-boss unavailable — exiting so the container restarts',
    );
    process.exit(
      1,
    );
  }
  backfillConsumer =
    await startScheduledConsumer(
      {
        queue:
          BACKFILL_QUEUE,
        cron: BACKFILL_CRON,
        expireInSeconds:
          6 *
          60 *
          60,
        retryLimit: 0,
        handler:
          backfillTick,
        shouldStop:
          () =>
            stopping,
        log: consumerLog,
      },
    );
  if (
    !backfillConsumer
  ) {
    if (
      stopping
    )
      return;
    log.error(
      'pg-boss unavailable — exiting so the container restarts',
    );
    process.exit(
      1,
    );
  }
  admitLiveConsumer = await startScheduledConsumer({
    queue: ADMIT_LIVE_QUEUE,
    cron: admitLiveCron,
    expireInSeconds: 20 * 60,
    retryLimit: 0,
    handler: admitLiveTick,
    shouldStop: () => stopping,
    log: consumerLog,
  });
  if (!admitLiveConsumer) {
    if (stopping) return;
    log.error('pg-boss unavailable — exiting so the container restarts');
    process.exit(1);
  }
  interviewsConsumer = await startScheduledConsumer({
    queue: INTERVIEWS_QUEUE,
    cron: interviewsCron,
    expireInSeconds: 3 * 60 * 60,
    retryLimit: 0,
    handler: interviewsTick,
    shouldStop: () => stopping,
    log: consumerLog,
  });
  if (!interviewsConsumer) {
    if (stopping) return;
    log.error('pg-boss unavailable — exiting so the container restarts');
    process.exit(1);
  }
  if (
    stopping
  )
    return;

  log.info(
    `Started — cycletrack="${cycletrackCron}" queues="${CYCLETRACK_QUEUE},${BACKFILL_QUEUE},${ADMIT_LIVE_QUEUE},${INTERVIEWS_QUEUE}" enabled=${CYCLETRACK_ENABLED} admit-live="${admitLiveCron}" interviews="${interviewsCron}" admitEnabled=${ADMIT_ENABLED}`,
  );
  if (
    backfillDue
  ) {
    // Only the hourly run is queued: it seeds the diff baseline, and its last step queues the
    // backfill once the counts are in, so the two never walk the same pages at the same time.
    log.info(
      'Bootstrap: backfill not complete — queueing cycletrack (it queues the backfill after)',
    );
    await cycletrackConsumer.runNow();
  }
}

main().catch(
  (
    e,
  ) => {
    log.error(
      `fatal: ${e instanceof Error ? e.message : String(e)}`,
    );
    process.exit(
      1,
    );
  },
);

// ─── Graceful shutdown ──────────────────────────────────────────

async function shutdown(
  signal: string,
) {
  // Re-entrant: a second signal must not start a second wait.
  if (
    stopping
  )
    return;
  stopping = true;
  log.info(
    `${signal} received, shutting down...`,
  );

  await Promise.all(
    [
      cycletrackConsumer?.pause(),
      backfillConsumer?.pause(),
      admitLiveConsumer?.pause(),
      interviewsConsumer?.pause(),
    ],
  );

  if (
    inFlight.size >
    0
  ) {
    log.info(
      'Waiting for in-flight run to complete...',
    );
    let timer:
      | NodeJS.Timeout
      | undefined;
    const drained =
      await Promise.race(
        [
          Promise.allSettled(
            [
              ...inFlight,
            ],
          ).then(
            () =>
              true,
          ),
          new Promise<boolean>(
            (
              resolve,
            ) => {
              timer =
                setTimeout(
                  () =>
                    resolve(
                      false,
                    ),
                  SHUTDOWN_DEADLINE_MS,
                );
            },
          ),
        ],
      );
    clearTimeout(
      timer,
    );
    if (
      !drained
    ) {
      log.error(
        `In-flight run did not finish within ${SHUTDOWN_DEADLINE_MS}ms — exiting anyway`,
      );
    }
  }

  // The pg-boss instance is shared by all four consumers, so stopping it once is enough.
  await (
    cycletrackConsumer ??
    backfillConsumer
  )?.stop();
  await prisma
    .$disconnect()
    .catch(
      () =>
        undefined,
    );
  process.exit(
    0,
  );
}

process.on(
  'SIGINT',
  () =>
    void shutdown(
      'SIGINT',
    ),
);
process.on(
  'SIGTERM',
  () =>
    void shutdown(
      'SIGTERM',
    ),
);
