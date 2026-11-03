/**
 * Submission side of the Altair verify queue. Imported by the socket hub, so it stays free of Prisma
 * and of the engine. See queue.server.ts for the worker and the bounds on what a submission can cost.
 */
import { getBoss } from '../../jobs/boss.server';
import { MAX_RUNS_PER_HOST_PER_HOUR, MAX_VERIFY_BACKLOG, VERIFY_COOP_QUEUE, type CoopRunJob } from './job';

const hostSubmissions = new Map<string, number[]>();

/** Sliding one-hour window per host. In-memory: the hub is a single instance. */
export function allowHostSubmission(hostUserId: string, now = Date.now()): boolean {
  const hourAgo = now - 3_600_000;
  const recent = (hostSubmissions.get(hostUserId) ?? []).filter((t) => t > hourAgo);
  if (recent.length >= MAX_RUNS_PER_HOST_PER_HOUR) {
    hostSubmissions.set(hostUserId, recent);
    return false;
  }
  recent.push(now);
  hostSubmissions.set(hostUserId, recent);
  return true;
}

export function __resetHostSubmissions(): void {
  hostSubmissions.clear();
}

export type QueueSubmitOutcome = 'queued' | 'rate_limited' | 'backlog_full' | 'no_queue' | 'failed';

/**
 * Put a finished match on the verify queue. Lightweight on purpose (no Prisma, no engine): the socket
 * hub calls this, and the hub must never run a replay itself.
 */
export async function submitToVerifyQueue(job: CoopRunJob): Promise<QueueSubmitOutcome> {
  if (!allowHostSubmission(job.hostUserId)) return 'rate_limited';
  const boss = await getBoss();
  if (boss) {
    try {
      await boss.createQueue(VERIFY_COOP_QUEUE);
      const queue = await boss.getQueue(VERIFY_COOP_QUEUE);
      if (queue && queue.queuedCount >= MAX_VERIFY_BACKLOG) return 'backlog_full';
      const id = await boss.send(VERIFY_COOP_QUEUE, job as unknown as object, {
        singletonKey: job.runId,
        // A rejected or duplicate run is a normal outcome, not a failure, so there is nothing to retry;
        // an infrastructure fault (the database) throws and gets two more tries.
        retryLimit: 2,
        retryDelay: 60,
        expireInSeconds: 30 * 60,
      });
      return id ? 'queued' : 'failed';
    } catch (error) {
      console.error('[altair] verify enqueue failed', error);
      return 'failed';
    }
  }
  return 'no_queue';
}

