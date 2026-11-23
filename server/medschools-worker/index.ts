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
 *   medschools.admit-history daily 03:10 — Admit profile-history backfill: the whole cycle, member-keyed (same secret).
 *
 *   medschools.admit-forums  every 3 hours, UTC (the cron is in admitForumsCron) — Admit's school forums, only the posts past each thread's
 *                             cursor; fetched at any hour, read by the model off-peak only (needs the dedupe secret).
 *
 *   medschools.sdn-live       daily (12:20 UTC) — Student Doctor Network RSS feeds, then the changed threads, with the
 *                             posts read by the extraction model (needs the dedupe secret; AI optional).
 *   medschools.sdn-backfill   monthly safety net, and queued by the live tick while the prior-year walk is owed
 *                             (own queue: its own cadence, budget share and back-off).
 *   medschools.sdn-interviews weekly — SDN summary-page interview reports (no model; needs the dedupe secret).
 *
 * The two CycleTrack jobs share ONE polite host (`createPoliteHost(SOURCES.CYCLETRACK)`), which is what makes them
 * mutually exclusive against CycleTrack: one request at a time at the configured rate, one halt flag.
 * The two Admit jobs share their own host (`createPoliteHost(SOURCES.ADMIT)`), independent of CycleTrack.
 * SDN has two hosts (forums for live and backfill, www for interviews), separate from both.
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
import { createGuard } from './guard';
import { createPoliteHost } from '../../features/medschools/scrape/http';
import { runAdmitForums } from '../../features/medschools/scrape/run-admit-forums';
import {
  ADMIT_FORUMS_PROMPT_ID,
  createForumsBudgetGate,
  forumsAiShare,
} from '../../features/medschools/scrape/admit-forums-budget';
import { runAdmitLive } from '../../features/medschools/scrape/run-admit-live';
import { runAdmitInterviews } from '../../features/medschools/scrape/run-admit-interviews';
import { admitHistoryOwed, runAdmitHistory } from '../../features/medschools/scrape/run-admit-history';
import admitAliasesJson from '../../data/medschools/admit-aliases.json';
import sdnAliasesJson from '../../data/medschools/sdn-aliases.json';
import sdnForumsJson from '../../data/medschools/sdn-forums.json';
import { runSdnLive, sdnBackfillOwed, type SdnForumsFile } from '../../features/medschools/scrape/run-sdn-live';
import { runSdnBackfill } from '../../features/medschools/scrape/run-sdn-backfill';
import { runSdnInterviews } from '../../features/medschools/scrape/run-sdn-interviews';
import { createSdnAi } from '../../features/medschools/scrape/sdn/provider.server';
import { createBudgetGate, monthlyCapUsd } from '../../features/medschools/scrape/sdn/budget';
import {
  ADMIT_FORUMS_DAILY_REQUESTS,
  ADMIT_HISTORY_DAILY_PROFILES,
  DAILY_REQUEST_BUDGETS,
  SOURCES,
} from '../../features/medschools/scrape/sources';
import { createDailyBudget } from '../../features/medschools/scrape/request-budget';
import { RMH_PUBLISH_CRON, runRmhPublish } from '../../features/medschools/scrape/run-rmh-publish';
import { runCycletrack } from '../../features/medschools/scrape/run-cycletrack';
import {
  needsBackfill,
  runBackfill,
} from '../../features/medschools/scrape/run-backfill';
import {
  seedAdmitAliases,
  seedAdmitIgnoredMisses,
  seedSdnAliases,
  seedSdnIgnoredMisses,
  type AdmitAliasFile,
  type SdnAliasFile,
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

// R12-style flag for the three SDN crons, the live tick's backfill queueing and nothing else (bootstrap queues no SDN
// run). Only an explicit manual runNow({ manual: true }) bypasses it. Alias seeding is not gated by it.
const SDN_ENABLED =
  process.env.MEDSCHOOLS_SDN_ENABLED !== 'false';

// Switches the Admit forums cron off on its own (it is also behind MEDSCHOOLS_ADMIT_ENABLED). Only a manual run bypasses it.
const ADMIT_FORUMS_ENABLED = process.env.MEDSCHOOLS_ADMIT_FORUMS_ENABLED !== 'false';

/** A positive integer from env, else the default. */
function intEnv(name: string, dflt: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : dflt;
}
/** Queue expiries (seconds). A run in flight past its expiry is treated as hung (guard.ts); a run ends itself earlier. */
const ADMIT_LIVE_EXPIRY_S = 20 * 60;
const INTERVIEWS_EXPIRY_S = 3 * 60 * 60;
const ADMIT_HISTORY_EXPIRY_S = 3 * 60 * 60;
const INTERVIEWS_RUN_DEADLINE_MS = 150 * 60_000;
const ADMIT_HISTORY_RUN_DEADLINE_MS = 150 * 60_000;
const SDN_MAX_LLM_CALLS = intEnv('MEDSCHOOLS_SDN_MAX_LLM_CALLS', 40);
const SDN_BACKFILL_MAX_LLM_CALLS = intEnv('MEDSCHOOLS_SDN_BACKFILL_MAX_LLM_CALLS', 150);
const SDN_LIVE_EXPIRY_S = 25 * 60;
const SDN_BACKFILL_EXPIRY_S = 3 * 60 * 60;
const SDN_INTERVIEWS_EXPIRY_S = 60 * 60;
const RMH_PUBLISH_EXPIRY_S = 10 * 60;
const ADMIT_FORUMS_EXPIRY_S = 40 * 60;
const ADMIT_FORUMS_RUN_DEADLINE_MS = 30 * 60_000;
const ADMIT_FORUMS_MAX_REQUESTS = intEnv('MEDSCHOOLS_ADMIT_FORUMS_MAX_REQUESTS', 80);
const ADMIT_FORUMS_MAX_LLM_CALLS = intEnv('MEDSCHOOLS_ADMIT_FORUMS_MAX_LLM_CALLS', 60);
const ADMIT_HISTORY_MAX_PROFILES = intEnv('MEDSCHOOLS_ADMIT_HISTORY_MAX_PROFILES', 600);

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
// Every host has a persisted DAILY request budget shared by all the jobs on it (request-budget.ts, MedRequestBudget):
// when it is spent the jobs stop and the next UTC day starts afresh. Env overrides: MEDSCHOOLS_<HOST>_DAILY_REQUESTS.
const hostBudget = (host: keyof typeof DAILY_REQUEST_BUDGETS) =>
  createDailyBudget(medPrisma, host, () => intEnv(`MEDSCHOOLS_${host}_DAILY_REQUESTS`, DAILY_REQUEST_BUDGETS[host]));

const cycletrackHost =
  createPoliteHost(
    SOURCES.CYCLETRACK,
    { budget: hostBudget('CYCLETRACK') },
  );

// One host for both Admit jobs, separate from CycleTrack's. FIFO: while the daily interviews walk
// (~600 requests) runs, live requests interleave one-for-one, so a live tick can run long and the
// inFlight guard may drop the next one. Accepted; the live feed's 6 h window absorbs it.
const admitHost =
  createPoliteHost(
    SOURCES.ADMIT,
    { budget: hostBudget('ADMIT') },
  );
// The history job's own daily quota of profile lookups, a share of the ADMIT budget above.
const admitHistoryQuota = createDailyBudget(medPrisma, 'ADMIT:history', () =>
  intEnv('MEDSCHOOLS_ADMIT_HISTORY_DAILY_PROFILES', ADMIT_HISTORY_DAILY_PROFILES),
);

// The forums job's own daily quota of requests, a share of the ADMIT budget above.
const admitForumsQuota = createDailyBudget(medPrisma, 'ADMIT:forums', () =>
  intEnv('MEDSCHOOLS_ADMIT_FORUMS_DAILY_REQUESTS', ADMIT_FORUMS_DAILY_REQUESTS),
);

// SDN has two politeness domains. Live and backfill share the forums host (the backfill takes its slower spacing
// session on it), so they never double the request rate; the interviews job has the www host to itself.
const sdnForumsHost = createPoliteHost(SOURCES.SDN_FORUMS, { budget: hostBudget('SDN_FORUMS') });
const sdnWwwHost = createPoliteHost(SOURCES.SDN_WWW, { budget: hostBudget('SDN_WWW') });

// The extraction model and its monthly budget are built once. `configured()` is false without a DeepSeek key:
// extraction then stores nothing and keeps its cursors, and the live tick queues no backfill.
const sdnAi = createSdnAi();
const sdnBudget = createBudgetGate(
  medPrisma,
  () => new Date(),
  monthlyCapUsd(process.env.MEDSCHOOLS_AI_MONTHLY_USD, (line) => log.warn(line)),
);
const sdnForums = sdnForumsJson as SdnForumsFile;
// The Admit forums job reads with the same static prompt but labels its calls, and spends only its own share of the same
// monthly cap (default 40%, MEDSCHOOLS_ADMIT_FORUMS_AI_SHARE) so SDN is never starved; the total stays under the cap.
const admitForumsAi = createSdnAi(ADMIT_FORUMS_PROMPT_ID);
const admitForumsBudget = createForumsBudgetGate(
  medPrisma,
  () => new Date(),
  monthlyCapUsd(process.env.MEDSCHOOLS_AI_MONTHLY_USD),
  forumsAiShare(process.env.MEDSCHOOLS_ADMIT_FORUMS_AI_SHARE, (line) => log.warn(line)),
);

/**
 * Wraps a job so a second concurrent call is skipped, so shutdown can await it, and so a run hung past its max
 * runtime (the queue's expiry) is abandoned loudly instead of blocking every later tick (guard.ts).
 */
const guarded = createGuard({ log, isStopping: () => stopping, inFlight });

/** A `shouldStop` that also turns true once `ms` have passed: the run ends itself before its queue expires. */
const stopAfter = (ms: number) => {
  const end = Date.now() + ms;
  return () => stopping || Date.now() > end;
};

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
  if (!ADMIT_ENABLED && data.manual !== true) {
    if (name !== 'admit-live') log.warn(`${name}: tick skipped — MEDSCHOOLS_ADMIT_ENABLED=false`);
    return false;
  }
  if (!secretOk()) {
    log.error(
      `${name}: MEDSCHOOLS_DEDUPE_SECRET is unset or shorter than 16 characters — run refused`,
    );
    return false;
  }
  return true;
}

/** True while an SDN backfill run executes in this process (the live tick must not queue another). */
let sdnBackfillInFlight = false;

/** Shared gate for the three SDN ticks: the flag first (manual bypasses), then the secret (never bypassed). */
function sdnGate(name: string, data: Record<string, unknown>): boolean {
  if (!SDN_ENABLED && data.manual !== true) return false;
  if (!secretOk()) {
    log.error(`${name}: MEDSCHOOLS_DEDUPE_SECRET is unset or shorter than 16 characters — run refused`);
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
        `admit-live run complete [${r.runId}] — status=${r.status} fetched=${r.fetched} created=${r.created} moved=${r.moved} alreadyStored=${r.alreadyStored} deferred=${r.deferred} programNull=${r.programNull} membersIngested=${r.membersIngested} misses=${r.misses} lookups=${r.lookups} rolledUp=${r.rolledUp} requests=${r.requests}`,
      );
    },
    ADMIT_LIVE_EXPIRY_S * 1000,
  );

const interviewsTick =
  guarded(
    'interviews',
    async (data) => {
      log.info(`interviews tick starting (manual=${data.manual === true}, enabled=${ADMIT_ENABLED}, secret=${secretOk()})`);
      if (!admitGate('interviews', data)) return;
      const r = await runAdmitInterviews(
        {
          prisma: medPrisma,
          host: admitHost,
          secret: process.env.MEDSCHOOLS_DEDUPE_SECRET ?? '',
          shouldStop: stopAfter(INTERVIEWS_RUN_DEADLINE_MS),
          deadlineMs: INTERVIEWS_RUN_DEADLINE_MS,
          log,
        },
        { trigger: data.manual === true ? 'MANUAL' : 'CRON' },
      );
      log.info(
        `interviews run complete [${r.runId}] — status=${r.status} statsRows=${r.statsRows} schoolsFetched=${r.schoolsFetched} schoolsSkipped=${r.schoolsSkipped} schoolsFailed=${r.schoolsFailed} schoolsUnavailable=${r.schoolsUnavailable} questionsCreated=${r.questionsCreated} questionsUpdated=${r.questionsUpdated} questionsDeleted=${r.questionsDeleted} misses=${r.misses} requests=${r.requests}`,
      );
    },
    INTERVIEWS_EXPIRY_S * 1000,
  );

const admitHistoryTick = guarded(
  'admit-history',
  async (data) => {
    log.info(`admit-history tick starting (manual=${data.manual === true}, enabled=${ADMIT_ENABLED}, secret=${secretOk()})`);
    if (!admitGate('admit-history', data)) return;
    const r = await runAdmitHistory(
      {
        prisma: medPrisma,
        host: admitHost,
        secret: process.env.MEDSCHOOLS_DEDUPE_SECRET ?? '',
        shouldStop: stopAfter(ADMIT_HISTORY_RUN_DEADLINE_MS),
        deadlineMs: ADMIT_HISTORY_RUN_DEADLINE_MS,
        maxProfiles: ADMIT_HISTORY_MAX_PROFILES,
        quota: admitHistoryQuota,
        log,
      },
      { trigger: data.manual === true ? 'MANUAL' : data.bootstrap === true ? 'BOOTSTRAP' : 'CRON' },
    );
    log.info(
      `admit-history run complete [${r.runId}] — status=${r.status} budgetSpent=${r.budgetSpent} discovered=${r.discovered} settled=${r.settled} fetched=${r.fetched} noProfile=${r.noProfile} failed=${r.failedLookups} remaining=${r.remaining} created=${r.eventsCreated} moved=${r.eventsMoved} existing=${r.eventsExisting} skipped=${r.entriesSkipped} misses=${r.misses} rolledUp=${r.rolledUp} requests=${r.requests}`,
    );
  },
  ADMIT_HISTORY_EXPIRY_S * 1000,
);

const admitForumsTick = guarded(
  'admit-forums',
  async (data) => {
    if (!ADMIT_FORUMS_ENABLED && data.manual !== true) return;
    if (!admitGate('admit-forums', data)) return;
    const r = await runAdmitForums(
      {
        prisma: medPrisma,
        host: admitHost,
        ai: admitForumsAi,
        budget: admitForumsBudget,
        secret: process.env.MEDSCHOOLS_DEDUPE_SECRET ?? '',
        shouldStop: stopAfter(ADMIT_FORUMS_RUN_DEADLINE_MS),
        log,
        maxRequests: ADMIT_FORUMS_MAX_REQUESTS,
        maxLlmCalls: ADMIT_FORUMS_MAX_LLM_CALLS,
        quota: admitForumsQuota,
      },
      { trigger: data.manual === true ? 'MANUAL' : 'CRON' },
    );
    log.info(
      `admit-forums run complete [${r.runId}] — status=${r.status} outcome=${r.outcome} listed=${r.threadsListed} pending=${r.pending} behind=${r.postsBehind} processed=${r.processed} scanned=${r.postsScanned} mirrored=${r.mirroredSkipped} llmCalls=${r.llmCalls} created=${r.eventsCreated} existing=${r.eventsExisting} rolledUp=${r.rolledUp} peakPaused=${r.peakPaused} budgetPaused=${r.budgetPaused} requests=${r.requests}`,
    );
  },
  ADMIT_FORUMS_EXPIRY_S * 1000,
);

const sdnLiveTick = guarded('sdn-live', async (data) => {
  if (!sdnGate('sdn-live', data)) return;
  const r = await runSdnLive(
    {
      prisma: medPrisma,
      host: sdnForumsHost,
      ai: sdnAi,
      budget: sdnBudget,
      secret: process.env.MEDSCHOOLS_DEDUPE_SECRET ?? '',
      forums: sdnForums,
      shouldStop: () => stopping,
      log,
      maxLlmCalls: SDN_MAX_LLM_CALLS,
    },
    { trigger: data.manual === true ? 'MANUAL' : 'CRON' },
  );
  log.info(
    `sdn-live run complete [${r.runId}] — status=${r.status} feeds=${r.feedsPolled} known=${r.threadsKnown} changed=${r.threadsChanged} pending=${r.pending} processed=${r.processed} pages=${r.pages} llmCalls=${r.llmCalls} events=${r.eventsCreated} questions=${r.questionsCreated} misses=${r.misses} rolledUp=${r.rolledUp} aiConfigured=${r.aiConfigured} budgetPaused=${r.budgetPaused} peakPaused=${r.peakPaused} outcome=${r.outcome} halted=${r.halted} requests=${r.requests}`,
  );
  // The walk owed since the last run resumes here, without waiting for the monthly cron. The queue is exclusive and the
  // backfill tick guarded, so a second queueing is a no-op; sdnBackfillOwed already rules out budget, peak and back-off
  // pauses and an AI-less worker. The queued run carries no manual marker, so the flag still governs it.
  if (!stopping && !sdnBackfillInFlight && SDN_ENABLED && r.outcome === 'ran') {
    try {
      if (await sdnBackfillOwed(medPrisma, new Date(), sdnAi.configured())) {
        log.info('sdn-live: backfill owed — queueing it');
        await sdnBackfillConsumer?.runNow();
      }
    } catch (e) {
      log.warn(`sdn-live: backfill check failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}, SDN_LIVE_EXPIRY_S * 1000);

const sdnBackfillTick = guarded('sdn-backfill', async (data) => {
  if (!sdnGate('sdn-backfill', data)) return;
  sdnBackfillInFlight = true;
  try {
    const r = await runSdnBackfill(
      {
        prisma: medPrisma,
        host: sdnForumsHost,
        ai: sdnAi,
        budget: sdnBudget,
        secret: process.env.MEDSCHOOLS_DEDUPE_SECRET ?? '',
        forums: sdnForums,
        shouldStop: () => stopping,
        log,
        maxLlmCalls: SDN_BACKFILL_MAX_LLM_CALLS,
      },
      { trigger: data.manual === true ? 'MANUAL' : 'CRON' },
    );
    log.info(
      `sdn-backfill run complete [${r.runId}] — status=${r.status} stage=${r.cursor.stage} noop=${r.noop} listingPages=${r.listingPages} discovered=${r.threadsDiscovered} pending=${r.pending} processed=${r.processed} pages=${r.pages} llmCalls=${r.llmCalls} events=${r.eventsCreated} questions=${r.questionsCreated} misses=${r.misses} requests=${r.requests}`,
    );
  } finally {
    sdnBackfillInFlight = false;
  }
}, SDN_BACKFILL_EXPIRY_S * 1000);

// The daily public snapshot of the RMH tracker counts (Q2). Needs no dedupe secret and is not behind a source flag: it
// copies figures already in the database, and without it a tracker count never becomes public.
const rmhPublishTick = guarded('rmh-publish', async (data) => {
  await runRmhPublish(
    { prisma: medPrisma, db: prisma, log },
    { trigger: data.manual === true ? 'MANUAL' : 'CRON' },
  );
}, RMH_PUBLISH_EXPIRY_S * 1000);

const sdnInterviewsTick = guarded('sdn-interviews', async (data) => {
  if (!sdnGate('sdn-interviews', data)) return;
  const r = await runSdnInterviews(
    {
      prisma: medPrisma,
      host: sdnWwwHost,
      secret: process.env.MEDSCHOOLS_DEDUPE_SECRET ?? '',
      shouldStop: () => stopping,
      log,
    },
    { trigger: data.manual === true ? 'MANUAL' : 'CRON' },
  );
  log.info(
    `sdn-interviews run complete [${r.runId}] — status=${r.status} schools=${r.schools} skipped=${r.skipped} fetched=${r.fetched} unavailable=${r.unavailable} failed=${r.failed} profiles=${r.profiles} questionsCreated=${r.questionsCreated} questionsRejected=${r.questionsRejected} duplicateKeys=${r.duplicateKeys} requests=${r.requests}`,
  );
}, SDN_INTERVIEWS_EXPIRY_S * 1000);

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
    // Own try/catch again: an SDN seed failure never blocks CycleTrack's or Admit's bootstrap. Not gated by
    // the SDN flag either (idempotent, queues no request, and the admin page needs the keys). A key owned by
    // another school is skipped, never moved; both lists are named so the next alias review can act on them.
    try {
      const sdn = await seedSdnAliases(seedPrisma, sdnAliasesJson as SdnAliasFile);
      log.info(`Bootstrap: seeded ${sdn.created} SDN alias keys (${sdn.unmatched.length} unmatched)`);
      if (sdn.unmatched.length > 0) {
        log.warn(`Bootstrap: ${sdn.unmatched.length} SDN keys have no school here: ${sdn.unmatched.join('; ')}`);
      }
      if (sdn.skipped.length > 0) {
        log.warn(
          `Bootstrap: ${sdn.skipped.length} SDN alias keys skipped (conflict): ${sdn.skipped.map((p) => `${p.cycletrackKey} -> ${p.key}`).join('; ')}`,
        );
      }
      const sdnIgnored = await seedSdnIgnoredMisses(seedPrisma, sdnAliasesJson as SdnAliasFile);
      if (sdnIgnored > 0) log.info(`Bootstrap: pre-ignored ${sdnIgnored} unmapped SDN stems`);
    } catch (e) {
      log.error(`Bootstrap: SDN alias seed failed: ${e instanceof Error ? e.message : String(e)}`);
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
const ADMIT_HISTORY_QUEUE = 'medschools.admit-history';
const admitLiveCron =
  process.env.MEDSCHOOLS_ADMIT_LIVE_CRON?.trim() || '*/5 * * * *';
const interviewsCron =
  process.env.MEDSCHOOLS_INTERVIEWS_CRON?.trim() || '35 4 * * *';
// Daily, off-peak, ending (about 50 min for the 1500-profile cap) before the interviews walk at 04:35.
const admitHistoryCron =
  process.env.MEDSCHOOLS_ADMIT_HISTORY_CRON?.trim() || '10 3 * * *';
const ADMIT_FORUMS_QUEUE = 'medschools.admit-forums';
// Every 3 hours, UTC: 0 3 6 9 12 15 18 21. Fetching runs at any hour; the model reads only off-peak (the 03, 06 and 09
// weekday runs look and hold). Persisted minimum interval 2.5 h, so a deploy never fires an extra one.
const admitForumsCron = process.env.MEDSCHOOLS_ADMIT_FORUMS_CRON?.trim() || '0 */3 * * *';
const SDN_LIVE_QUEUE = 'medschools.sdn-live';
const SDN_BACKFILL_QUEUE = 'medschools.sdn-backfill';
const SDN_INTERVIEWS_QUEUE = 'medschools.sdn-interviews';
const RMH_PUBLISH_QUEUE = 'medschools.rmh-publish';
const sdnLiveCron = process.env.MEDSCHOOLS_SDN_LIVE_CRON?.trim() || '20 12 * * *';
// Monthly safety net: the live tick queues the real walk, this one covers a missed tick and the budget reset (1st, UTC).
const sdnBackfillCron = process.env.MEDSCHOOLS_SDN_BACKFILL_CRON?.trim() || '15 0 1 * *';
// Monday just before DeepSeek's 06:00 UTC peak; the job uses no model anyway.
const sdnInterviewsCron = process.env.MEDSCHOOLS_SDN_INTERVIEWS_CRON?.trim() || '50 5 * * 1';
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
let admitHistoryConsumer: ScheduledConsumer | null = null;
let admitForumsConsumer: ScheduledConsumer | null = null;
let sdnLiveConsumer: ScheduledConsumer | null = null;
let sdnBackfillConsumer: ScheduledConsumer | null = null;
let sdnInterviewsConsumer: ScheduledConsumer | null = null;
let rmhPublishConsumer: ScheduledConsumer | null = null;

async function main() {
  // The Admit jobs hash dedupe keys with this and refuse to run without it; CycleTrack never reads it.
  if (!secretOk()) {
    log.error(
      'MEDSCHOOLS_DEDUPE_SECRET is unset or shorter than 16 characters — the Admit jobs (admit-live, interviews) are disabled; CycleTrack is unaffected. Set it with: openssl rand -hex 32',
    );
  }

  if (!secretOk()) {
    log.error(
      'MEDSCHOOLS_DEDUPE_SECRET is unset or shorter than 16 characters — the SDN jobs (sdn-live, sdn-backfill, sdn-interviews) are disabled too',
    );
  }
  if (!admitForumsAi.configured()) {
    log.warn('DEEPSEEK_API_KEY is not set — Admit forum posts are not read (counts are still tracked, cursors kept)');
  }
  if (!sdnAi.configured()) {
    log.warn(
      'DEEPSEEK_API_KEY is not set — SDN extraction stores nothing and keeps its cursors; the SDN interviews job still runs',
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
    expireInSeconds: ADMIT_LIVE_EXPIRY_S,
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
    expireInSeconds: INTERVIEWS_EXPIRY_S,
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
  admitHistoryConsumer = await startScheduledConsumer({
    queue: ADMIT_HISTORY_QUEUE,
    cron: admitHistoryCron,
    expireInSeconds: ADMIT_HISTORY_EXPIRY_S,
    retryLimit: 0,
    handler: admitHistoryTick,
    shouldStop: () => stopping,
    log: consumerLog,
  });
  if (!admitHistoryConsumer) {
    if (stopping) return;
    log.error('pg-boss unavailable — exiting so the container restarts');
    process.exit(1);
  }
  sdnLiveConsumer = await startScheduledConsumer({
    queue: SDN_LIVE_QUEUE,
    cron: sdnLiveCron,
    expireInSeconds: SDN_LIVE_EXPIRY_S,
    retryLimit: 0,
    handler: sdnLiveTick,
    shouldStop: () => stopping,
    log: consumerLog,
  });
  if (!sdnLiveConsumer) {
    if (stopping) return;
    log.error('pg-boss unavailable — exiting so the container restarts');
    process.exit(1);
  }
  sdnBackfillConsumer = await startScheduledConsumer({
    queue: SDN_BACKFILL_QUEUE,
    cron: sdnBackfillCron,
    expireInSeconds: SDN_BACKFILL_EXPIRY_S,
    retryLimit: 0,
    handler: sdnBackfillTick,
    shouldStop: () => stopping,
    log: consumerLog,
  });
  if (!sdnBackfillConsumer) {
    if (stopping) return;
    log.error('pg-boss unavailable — exiting so the container restarts');
    process.exit(1);
  }
  sdnInterviewsConsumer = await startScheduledConsumer({
    queue: SDN_INTERVIEWS_QUEUE,
    cron: sdnInterviewsCron,
    expireInSeconds: SDN_INTERVIEWS_EXPIRY_S,
    retryLimit: 0,
    handler: sdnInterviewsTick,
    shouldStop: () => stopping,
    log: consumerLog,
  });
  if (!sdnInterviewsConsumer) {
    if (stopping) return;
    log.error('pg-boss unavailable — exiting so the container restarts');
    process.exit(1);
  }
  rmhPublishConsumer = await startScheduledConsumer({
    queue: RMH_PUBLISH_QUEUE,
    cron: RMH_PUBLISH_CRON,
    expireInSeconds: RMH_PUBLISH_EXPIRY_S,
    retryLimit: 0,
    handler: rmhPublishTick,
    shouldStop: () => stopping,
    log: consumerLog,
  });
  if (!rmhPublishConsumer) {
    if (stopping) return;
    log.error('pg-boss unavailable — exiting so the container restarts');
    process.exit(1);
  }
  admitForumsConsumer = await startScheduledConsumer({
    queue: ADMIT_FORUMS_QUEUE,
    cron: admitForumsCron,
    expireInSeconds: ADMIT_FORUMS_EXPIRY_S,
    retryLimit: 0,
    handler: admitForumsTick,
    shouldStop: () => stopping,
    log: consumerLog,
  });
  if (!admitForumsConsumer) {
    if (stopping) return;
    log.error('pg-boss unavailable — exiting so the container restarts');
    process.exit(1);
  }
  if (
    stopping
  )
    return;

  log.info(
    `Started — cycletrack="${cycletrackCron}" queues="${CYCLETRACK_QUEUE},${BACKFILL_QUEUE},${ADMIT_LIVE_QUEUE},${INTERVIEWS_QUEUE}" enabled=${CYCLETRACK_ENABLED} admit-live="${admitLiveCron}" interviews="${interviewsCron}" admit-history="${admitHistoryCron}" admitEnabled=${ADMIT_ENABLED} sdn-live="${sdnLiveCron}" sdn-backfill="${sdnBackfillCron}" sdn-interviews="${sdnInterviewsCron}" sdnEnabled=${SDN_ENABLED} queues+="${SDN_LIVE_QUEUE},${SDN_BACKFILL_QUEUE},${SDN_INTERVIEWS_QUEUE},${RMH_PUBLISH_QUEUE},${ADMIT_HISTORY_QUEUE}" rmh-publish="${RMH_PUBLISH_CRON}" admit-forums="${admitForumsCron}" forumsEnabled=${ADMIT_FORUMS_ENABLED}`,
  );
  // The profile-history backfill is owed until one pass has completed: queue it at once on the first deploy (and after
  // an interrupted first run) rather than wait for the 03:10 cron. Its first step is the one-time ADMIT re-key.
  if (ADMIT_ENABLED && secretOk()) {
    try {
      if (await admitHistoryOwed(medPrisma)) {
        log.info('Bootstrap: Admit history backfill not yet completed — queueing it');
        await admitHistoryConsumer.runNow({ bootstrap: true });
      }
    } catch (e) {
      log.warn(`Bootstrap: Admit history check failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
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
      admitHistoryConsumer?.pause(),
      sdnLiveConsumer?.pause(),
      sdnBackfillConsumer?.pause(),
      sdnInterviewsConsumer?.pause(),
      rmhPublishConsumer?.pause(),
      admitForumsConsumer?.pause(),
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

  // The pg-boss instance is shared by all seven consumers, so stopping it once is enough.
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
