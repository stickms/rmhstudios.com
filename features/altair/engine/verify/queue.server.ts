/**
 * Altair co-op verification as a queued job.
 *
 * A finished match is handed over as a CoopRunJob (hub-trusted setup + the host's untrusted log and
 * claim). The replay is CPU-heavy (~2.5 ms per sim step, so a 20 minute match is a few minutes of
 * CPU), which is why it never runs in the hub or in a request: it is a pg-boss job drained by the
 * dedicated `jobs` worker, one at a time, yielding to the event loop as it goes. When the queue is
 * unavailable the work runs in-process, in the background, through the same serialised replay
 * (slow, never skipped).
 *
 * Bounds that keep a cheater from turning the verifier into a DoS:
 *   - the log is structurally capped before any step is simulated (run-log.ts);
 *   - a run cannot contain more sim time than the hub saw on the wall clock (verify-coop.ts), so
 *     verification costs at most ~15% of the time the match was actually played;
 *   - one job at a time, a wall-clock deadline, and a retry limit of 0 for a rejected run;
 *   - at most MAX_RUNS_PER_HOST_PER_HOUR submissions per host and MAX_VERIFY_BACKLOG waiting jobs;
 *   - the unique `runId` makes a replayed submission a no-op.
 */
import { prisma } from '@/lib/prisma.server';
import { VERIFY_COOP_QUEUE, type CoopRunJob } from './job';
import { submitToVerifyQueue, type QueueSubmitOutcome } from './submit.server';
import { persistVerifiedCoopRun, type PersistOutcome } from './persist.server';
import { verifyCoopRun, type VerifiedCoopRun, type VerifyFailure } from './verify-coop';

export type ProcessOutcome =
  | { status: 'saved'; matchId: string }
  | { status: 'duplicate' }
  | { status: 'rejected'; reason: VerifyFailure | 'no_players'; detail: string };

export interface ProcessDeps {
  recorded: (runId: string) => Promise<boolean>;
  persist: (job: CoopRunJob, run: VerifiedCoopRun) => Promise<PersistOutcome>;
  verify: typeof verifyCoopRun;
}

const defaultDeps: ProcessDeps = {
  recorded: async (runId) => (await prisma.altairMatch.findUnique({ where: { runId }, select: { id: true } })) !== null,
  persist: persistVerifiedCoopRun,
  verify: verifyCoopRun,
};

/** Verify one run and, only if the replay agrees with the claim, persist the REPLAY's numbers. */
export async function processCoopRun(job: CoopRunJob, deps: ProcessDeps = defaultDeps): Promise<ProcessOutcome> {
  // A repeat of a run that is already recorded is dropped before any simulation is paid for.
  if (await deps.recorded(job.runId)) return { status: 'duplicate' };

  const out = await deps.verify(
    {
      seed: job.seed,
      doubleTime: job.doubleTime,
      roster: job.roster.map((p) => ({ id: p.userId, classId: p.classId, slot: p.slot })),
      joins: job.joins.map((p) => ({ id: p.userId, classId: p.classId, slot: p.slot })),
      wallMs: job.wallMs,
    },
    job.log,
    job.claim,
    { timeoutMs: 10 * 60_000, chunkSteps: 100 },
  );
  if (!out.ok) {
    console.warn(
      JSON.stringify({ event: 'altair.run_rejected', runId: job.runId, lobbyId: job.lobbyId, host: job.hostUserId, reason: out.reason, detail: out.detail }),
    );
    return { status: 'rejected', reason: out.reason, detail: out.detail };
  }
  const saved = await deps.persist(job, out.verified);
  if (saved.saved) return { status: 'saved', matchId: saved.matchId };
  if (saved.reason === 'duplicate') return { status: 'duplicate' };
  return { status: 'rejected', reason: 'no_players', detail: 'no verified player maps to an account' };
}

// ---- Submission with an in-process fallback (the web route) ---------------------------

export type EnqueueOutcome = QueueSubmitOutcome | 'inline';

export async function enqueueCoopRun(job: CoopRunJob): Promise<EnqueueOutcome> {
  const out = await submitToVerifyQueue(job);
  if (out !== 'no_queue') return out;
  void processCoopRun(job).catch((e) => console.error('[altair] in-process verification failed', e));
  return 'inline';
}

/** Register the worker. Called from `server/jobs/index.ts`. */
export async function registerAltairVerifyWorker(boss: {
  createQueue: (name: string) => Promise<unknown>;
  work: (name: string, handler: (jobs: { data: CoopRunJob }[]) => Promise<void>) => Promise<unknown>;
}): Promise<void> {
  await boss.createQueue(VERIFY_COOP_QUEUE);
  await boss.work(VERIFY_COOP_QUEUE, async (jobs) => {
    // One at a time: the replay is single-threaded CPU and the engine is process-global.
    for (const job of jobs) await processCoopRun(job.data);
  });
}
