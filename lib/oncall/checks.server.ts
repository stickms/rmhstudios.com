// The application alarm loop. Runs once a minute in the `jobs` worker (one
// instance in production), gathers what `rules.ts` needs, and sends debounced
// transitions plus a "jobs" heartbeat to the on-call watchdog.
//
// WHY THE JOBS WORKER: it already holds every source — the perf snapshots the
// web workers publish to Redis (via the admin collector), Prisma, pg-boss — and
// is not on a user request path. If it dies the heartbeat stops and the
// watchdog pages (A16), so the checker can't fail silently.
//
// Every source is gathered independently: a broken one becomes `null` and its
// rules hold state for that check, instead of the whole loop failing.

import { collectPerfOverview } from '../perf/admin.server';
import { prisma } from '../prisma.server';
import { getBoss } from '../jobs/boss.server';
import { oncallClient, type OncallClient } from './client.server';
import {
  Debouncer,
  evaluate,
  newMemory,
  type CheckInputs,
  type QueueFacts,
  type Transition,
} from './rules';

export const CHECK_INTERVAL_MS = 60_000;

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[oncall] check source failed:', (err as Error)?.message ?? err);
    return null;
  }
}

async function dbFacts(): Promise<CheckInputs['db']> {
  const rows = await prisma.$queryRaw<{ backends: bigint; max: string }[]>`
    SELECT (SELECT count(*) FROM pg_stat_activity) AS backends,
           current_setting('max_connections') AS max`;
  const r = rows[0];
  return r ? { backends: Number(r.backends), maxConnections: Number(r.max) } : null;
}

async function queueFacts(): Promise<QueueFacts[] | null> {
  const boss = await getBoss(true);
  if (!boss) return null;
  const queues = await boss.getQueues();
  return queues.map((q) => ({
    name: q.name,
    failedCount: q.failedCount,
    readyCount: q.readyCount,
  }));
}

async function outboxOldestPendingMs(now: number): Promise<number> {
  const row = await prisma.outboxEvent.findFirst({
    where: { deliveredAt: null, deadAt: null, nextAttempt: { lte: new Date(now) } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  return row ? Math.max(0, now - row.createdAt.getTime()) : 0;
}

export async function gatherInputs(now = Date.now()): Promise<CheckInputs> {
  const [overview, db, queues, outbox] = await Promise.all([
    settle(collectPerfOverview()),
    settle(dbFacts()),
    settle(queueFacts()),
    settle(outboxOldestPendingMs(now)),
  ]);
  return { now, overview, db, queues, outboxOldestPendingMs: outbox };
}

async function deliver(client: OncallClient, debouncer: Debouncer, tr: Transition): Promise<void> {
  const c = tr.condition;
  try {
    await client.send({
      state: tr.state,
      id: c.id,
      instance: c.instance,
      sev: c.sev,
      title: c.title,
      detail: c.detail,
      source: 'jobs',
    });
  } catch (err) {
    debouncer.undo(tr); // retried on the next check
    console.error(
      '[oncall] alarm delivery failed:',
      Debouncer.key(c),
      (err as Error)?.message ?? err,
    );
  }
}

/** Start the loop. Returns a stop function; a no-op when on-call isn't configured. */
export function startOncallChecks(): () => void {
  const client = oncallClient();
  if (!client) {
    console.warn('[oncall] ONCALL_URL / ONCALL_SIGNING_SECRET not set — app alarms disabled');
    return () => {};
  }
  const debouncer = new Debouncer();
  const memory = newMemory();
  let running = false;

  const tick = async () => {
    if (running) return; // a slow check never overlaps the next
    running = true;
    try {
      const input = await gatherInputs();
      const transitions = debouncer.step(evaluate(input, memory), input.now);
      for (const tr of transitions) await deliver(client, debouncer, tr);
      // Last, so a check that throws above doesn't count as alive.
      await client
        .heartbeat('jobs')
        .catch((err) => console.error('[oncall] heartbeat failed:', (err as Error)?.message));
    } catch (err) {
      console.error('[oncall] check failed:', (err as Error)?.message ?? err);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), CHECK_INTERVAL_MS);
  void tick();
  console.warn('[oncall] app alarm checks started (every 60s)');
  return () => clearInterval(timer);
}
