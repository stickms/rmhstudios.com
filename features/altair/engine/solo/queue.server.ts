/**
 * Altair single-player verification as a queued job (mirror of verify/queue.server.ts for co-op).
 *
 * The replay is CPU-heavy (~0.3-1.5 ms per sim step, so a 20 minute run is up to ~2 minutes of CPU), so
 * it never runs in a request: it is a pg-boss job drained by the dedicated `jobs` worker, one at a
 * time, yielding to the event loop. Bounds that stop it becoming a DoS:
 *   - the log is structurally capped before any step is simulated (solo-log.ts);
 *   - a run cannot contain more sim time than the SERVER's wall clock between issuing it and receiving
 *     the log (verify-solo.ts), so verification costs a fraction of the time the run was played;
 *   - one job at a time, a wall-clock deadline, no retries for a rejected run;
 *   - one open run per user, MAX_SOLO_SUBMISSIONS_PER_HOUR per user, MAX_SOLO_BACKLOG waiting jobs;
 *   - the run row's status flip makes a repeated submission a no-op.
 */
import { prisma } from '@/lib/prisma.server';
import { getBoss } from '@/lib/jobs/boss.server';
import { MAX_SOLO_BACKLOG, MAX_SOLO_SUBMISSIONS_PER_HOUR, VERIFY_SOLO_QUEUE, type SoloRunJob } from './job';
import { persistVerifiedSoloRun, type SoloPersistOutcome } from './persist.server';
import { verifySoloRun, type SoloFailure, type SoloVerifyOutcome } from './verify-solo';
import { canonicalLoadout } from './verify-solo';
import { checkLoadout, type SoloLoadout } from './solo-log';
import type { SoloResult } from './solo-run';

export type SoloProcessOutcome =
  | { status: 'saved'; coins: number }
  | { status: 'duplicate' }
  /** Could not be replayed through no fault of the player (played on an older sim): paid once via the capped fallback. */
  | { status: 'unverified'; reason: 'stale_sim'; detail: string }
  | { status: 'rejected'; reason: SoloFailure | 'no_run'; detail: string };

export interface SoloRunRow {
  id: string;
  userId: string;
  seed: number;
  classId: string;
  doubleTime: boolean;
  loadout: unknown;
  status: string;
}

export interface SoloProcessDeps {
  load: (runId: string) => Promise<SoloRunRow | null>;
  verify: typeof verifySoloRun;
  persist: (runId: string, userId: string, run: SoloResult) => Promise<SoloPersistOutcome>;
  reject: (runId: string, reason: string) => Promise<void>;
  /** Settle as `unverified` (the client then takes the capped fallback payout, once). */
  markUnverified: (runId: string, reason: string) => Promise<void>;
}

const defaultDeps: SoloProcessDeps = {
  load: (runId) =>
    prisma.altairSoloRun.findUnique({
      where: { id: runId },
      select: { id: true, userId: true, seed: true, classId: true, doubleTime: true, loadout: true, status: true },
    }),
  verify: verifySoloRun,
  persist: persistVerifiedSoloRun,
  reject: async (runId, reason) => {
    await prisma.altairSoloRun.updateMany({
      where: { id: runId, status: 'submitted' },
      data: { status: 'rejected', rejectReason: reason.slice(0, 500) },
    });
  },
  markUnverified: async (runId, reason) => {
    await prisma.altairSoloRun.updateMany({
      where: { id: runId, status: 'submitted' },
      data: { status: 'unverified', rejectReason: reason.slice(0, 500) },
    });
  },
};

/** Verify one submitted run and, only if the replay agrees with the claim, persist the REPLAY's numbers. */
export async function processSoloRun(job: SoloRunJob, deps: SoloProcessDeps = defaultDeps): Promise<SoloProcessOutcome> {
  const row = await deps.load(job.runId);
  if (!row || row.userId !== job.userId) return { status: 'rejected', reason: 'no_run', detail: 'unknown run' };
  // Only a freshly submitted run is replayed; anything else was already settled (no simulation paid for).
  if (row.status !== 'submitted') return { status: 'duplicate' };
  if (!checkLoadout(row.loadout)) {
    await deps.reject(job.runId, 'stored loadout invalid');
    return { status: 'rejected', reason: 'setup_mismatch', detail: 'stored loadout invalid' };
  }

  const out: SoloVerifyOutcome = await deps.verify(
    {
      seed: row.seed,
      classId: row.classId,
      doubleTime: row.doubleTime,
      loadout: canonicalLoadout(row.loadout as SoloLoadout),
      wallMs: job.wallMs,
    },
    job.log,
    job.claim,
    { timeoutMs: 10 * 60_000, chunkSteps: 100 },
  );
  if (!out.ok && out.reason === 'stale_sim') {
    // A deploy landed between this run starting and its log being replayed. Not cheating, not payable by replay.
    console.warn(JSON.stringify({ event: 'altair.solo_stale_sim', runId: job.runId, user: job.userId, detail: out.detail }));
    await deps.markUnverified(job.runId, `${out.reason}: ${out.detail}`);
    return { status: 'unverified', reason: 'stale_sim', detail: out.detail };
  }
  if (!out.ok) {
    console.warn(JSON.stringify({ event: 'altair.solo_rejected', runId: job.runId, user: job.userId, reason: out.reason, detail: out.detail }));
    await deps.reject(job.runId, `${out.reason}: ${out.detail}`);
    return { status: 'rejected', reason: out.reason, detail: out.detail };
  }
  const saved = await deps.persist(job.runId, job.userId, out.verified);
  return saved.saved ? { status: 'saved', coins: saved.coins } : { status: 'duplicate' };
}

// ---- Submission ----------------------------------------------------------------------

const userSubmissions = new Map<string, number[]>();

/** Sliding one-hour window per user. In-memory per web process. */
export function allowSoloSubmission(userId: string, now = Date.now()): boolean {
  const recent = (userSubmissions.get(userId) ?? []).filter((t) => t > now - 3_600_000);
  if (recent.length >= MAX_SOLO_SUBMISSIONS_PER_HOUR) {
    userSubmissions.set(userId, recent);
    return false;
  }
  recent.push(now);
  userSubmissions.set(userId, recent);
  return true;
}

export type SoloEnqueueOutcome = 'queued' | 'inline' | 'backlog_full' | 'failed';

export async function enqueueSoloRun(job: SoloRunJob): Promise<SoloEnqueueOutcome> {
  const boss = await getBoss();
  if (!boss) {
    // No queue (dev, or pg-boss down): replay in the background of this process, still serialised.
    void processSoloRun(job).catch((e) => console.error('[altair] in-process solo verification failed', e));
    return 'inline';
  }
  try {
    await boss.createQueue(VERIFY_SOLO_QUEUE);
    const queue = await boss.getQueue(VERIFY_SOLO_QUEUE);
    if (queue && queue.queuedCount >= MAX_SOLO_BACKLOG) return 'backlog_full';
    const id = await boss.send(VERIFY_SOLO_QUEUE, job as unknown as object, {
      singletonKey: job.runId,
      // A rejected or duplicate run is a normal outcome; only an infrastructure fault throws and retries.
      retryLimit: 2,
      retryDelay: 60,
      expireInSeconds: 30 * 60,
    });
    return id ? 'queued' : 'failed';
  } catch (error) {
    console.error('[altair] solo verify enqueue failed', error);
    return 'failed';
  }
}

/** Register the worker. Called from `server/jobs/index.ts`. */
export async function registerAltairSoloWorker(boss: {
  createQueue: (name: string) => Promise<unknown>;
  work: (name: string, handler: (jobs: { data: SoloRunJob }[]) => Promise<void>) => Promise<unknown>;
}): Promise<void> {
  await boss.createQueue(VERIFY_SOLO_QUEUE);
  await boss.work(VERIFY_SOLO_QUEUE, async (jobs) => {
    // One at a time: the replay is single-threaded CPU and the engine and run store are process-global.
    for (const job of jobs) await processSoloRun(job.data);
  });
}
