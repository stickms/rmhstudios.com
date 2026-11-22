/**
 * Durable fan-outs (s08-05), server only. Mirrors the bulk runner (`lib/bulk/bulk.server.ts`) for the two notification
 * fan-outs that used to be at-most-once when a worker died mid-send: community post alerts and event updates.
 *
 * A `FanoutRun` row per (kind, subject) is the authority. A runner takes the lease with one conditional write
 * (`heartbeatAt` older than {@link LEASE_MS}), reads one batch of the audience after the stored cursor, notifies it, and
 * writes the cursor, the counters and a new `heartbeatAt` with a compare-and-set on the lease it holds. A runner that
 * lost the lease stops at its next batch. A batch is notified before its progress is written, so a crash in between
 * re-sends at most that one batch; the first batch of a resumed run therefore drops the members who already have a
 * notification for the subject created since the run started (one query on the `[userId, type, createdAt]` index).
 *
 * `reclaimStalledFanouts` runs every minute (`./queue.server`): it re-queues runs whose lease expired and stops a run
 * that keeps dying after {@link MAX_RECLAIMS} reclaims. Logs carry the kind and the subject id, never a member.
 */
import { prisma } from '@/lib/prisma.server';
import { MAX_RECLAIMS, leaseCutoff, toldIds, withoutTold, type FanoutKind } from '@/lib/fanout/run';

export { LEASE_MS, MAX_RECLAIMS } from '@/lib/fanout/run';

/** One batch of the audience, already filtered by the fan-out's own rules. */
export interface FanoutBatch {
  /** Members to notify. */
  recipients: string[];
  /** Members whose existing alert is reworded instead of a new notification (post alerts). */
  collapse: string[];
  /** The last audience id read; the next batch starts after it. Null when the batch read nobody. */
  lastId: string | null;
  /** Audience members read for this batch (before filtering). */
  scanned: number;
  /** True when the audience is exhausted after this batch. */
  done: boolean;
}

export interface FanoutSpec {
  kind: FanoutKind;
  subjectId: string;
  /** The notification a delivery writes; the "already told" check looks for it. */
  delivery: {
    type: 'SYSTEM';
    entityType: string;
    entityId: string;
    /** Unique to the subject (the post or update id is in it): what "already told" matches on. */
    link: string;
  };
  /** Read and filter the next batch strictly after `cursor`. `scanned` is how many members earlier batches read. */
  step(cursor: string | null, scanned: number): Promise<FanoutBatch>;
  /** Notify (and reword) one batch. Called at most once per batch by the runner that holds the lease. */
  send(recipients: string[], collapse: string[]): Promise<void>;
}

export interface FanoutTotals {
  sent: number;
  collapsed: number;
}

const RUN_SELECT = {
  id: true,
  cursor: true,
  sent: true,
  collapsed: true,
  scanned: true,
  startedAt: true,
} as const;

/** Create the run (this runner holds its lease) or take over a RUNNING one whose lease expired. Null when it is held or finished. */
async function acquire(spec: FanoutSpec, now: Date) {
  const beat = new Date();
  const created = await prisma.fanoutRun.createMany({
    data: [
      {
        kind: spec.kind,
        subjectId: spec.subjectId,
        status: 'RUNNING',
        heartbeatAt: beat,
        startedAt: now,
      },
    ],
    skipDuplicates: true,
  });
  let resumed = false;
  if (created.count !== 1) {
    const claimed = await prisma.fanoutRun.updateMany({
      where: {
        kind: spec.kind,
        subjectId: spec.subjectId,
        status: 'RUNNING',
        heartbeatAt: {
          lt: leaseCutoff(now),
        },
      },
      data: {
        heartbeatAt: beat,
      },
    });
    if (claimed.count !== 1) return null;
    resumed = true;
  }
  const run = await prisma.fanoutRun.findUnique({
    where: {
      kind_subjectId: {
        kind: spec.kind,
        subjectId: spec.subjectId,
      },
    },
    select: RUN_SELECT,
  });
  return run
    ? {
        run,
        lease: beat,
        resumed,
      }
    : null;
}

/** Members of `ids` who already have a notification of this delivery created since the run began. */
async function alreadyTold(spec: FanoutSpec, ids: string[], since: Date): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await prisma.notification.findMany({
    where: {
      userId: {
        in: ids,
      },
      type: spec.delivery.type,
      createdAt: {
        gte: since,
      },
    },
    select: {
      userId: true,
      entityType: true,
      link: true,
    },
  });
  return toldIds(
    (Array.isArray(rows) ? rows : []).filter((r) => r.entityType === spec.delivery.entityType),
    spec.delivery.link,
  );
}

/**
 * Run (or resume) the fan-out for one subject. Returns the run's totals when this call finished it or stopped
 * because it lost the lease; null when the run is held by a live runner, already DONE, or FAILED (a duplicate or late
 * job does nothing). A thrown error gives the lease back, so a retry continues from the cursor, and is rethrown.
 */
export async function runFanout(spec: FanoutSpec, now: Date = new Date()): Promise<FanoutTotals | null> {
  const got = await acquire(spec, now);
  if (!got) return null;
  let lease = got.lease;
  let cursor = got.run.cursor;
  let scanned = got.run.scanned;
  const totals: FanoutTotals = {
    sent: got.run.sent,
    collapsed: got.run.collapsed,
  };
  let first = true;

  try {
    for (;;) {
      const batch = await spec.step(cursor, scanned);
      let recipients = batch.recipients;
      let collapse = batch.collapse;
      // Members skipped as already told were notified by the earlier runner, so they count as sent.
      let skipped = 0;
      if (first && got.resumed) {
        // The previous runner may have sent this batch before it died: skip who already has the notification.
        const told = await alreadyTold(spec, [...recipients, ...collapse], got.run.startedAt);
        recipients = withoutTold(recipients, told);
        collapse = withoutTold(collapse, told);
        skipped = batch.recipients.length + batch.collapse.length - recipients.length - collapse.length;
      }
      first = false;
      if (recipients.length > 0 || collapse.length > 0) await spec.send(recipients, collapse);

      const beat = new Date();
      const nextCursor = batch.lastId ?? cursor;
      const progress = await prisma.fanoutRun.updateMany({
        where: {
          id: got.run.id,
          status: 'RUNNING',
          heartbeatAt: lease,
        },
        data: {
          heartbeatAt: beat,
          cursor: nextCursor,
          sent: {
            increment: recipients.length + skipped,
          },
          collapsed: {
            increment: collapse.length,
          },
          scanned: {
            increment: batch.scanned,
          },
        },
      });
      // Someone else holds the lease now (it expired under a slow batch): stop; they continue after the cursor.
      if (progress.count === 0) return null;
      lease = beat;
      cursor = nextCursor;
      scanned += batch.scanned;
      totals.sent += recipients.length + skipped;
      totals.collapsed += collapse.length;
      if (batch.done) break;
    }
    await prisma.fanoutRun.updateMany({
      where: {
        id: got.run.id,
        status: 'RUNNING',
        heartbeatAt: lease,
      },
      data: {
        status: 'DONE',
        finishedAt: new Date(),
      },
    });
    return totals;
  } catch (error) {
    console.error(
      `[fanout] ${spec.kind} ${spec.subjectId} failed:`,
      error instanceof Error ? error.message : 'unknown error',
    );
    // Give the lease back (compare-and-set) so the job's retry resumes at once rather than after two minutes.
    await prisma.fanoutRun
      .updateMany({
        where: {
          id: got.run.id,
          status: 'RUNNING',
          heartbeatAt: lease,
        },
        data: {
          heartbeatAt: new Date(0),
        },
      })
      .catch(() => {});
    throw error;
  }
}

export interface ReclaimedRun {
  kind: FanoutKind;
  subjectId: string;
}

/**
 * The reclaim sweep (every minute, in the jobs worker). Finds RUNNING runs whose lease expired and returns the
 * (kind, subject) pairs to queue again, counting each in `reclaims`. A run already reclaimed {@link MAX_RECLAIMS}
 * times is FAILED instead. Each change compares-and-sets the state it read, so two sweeps never count one run twice.
 */
export async function reclaimStalledFanouts(now: Date = new Date(), take = 50): Promise<ReclaimedRun[]> {
  const expired = {
    status: 'RUNNING' as const,
    heartbeatAt: {
      lt: leaseCutoff(now),
    },
  };
  const rows = await prisma.fanoutRun.findMany({
    where: expired,
    orderBy: {
      startedAt: 'asc',
    },
    take,
    select: {
      id: true,
      kind: true,
      subjectId: true,
      reclaims: true,
    },
  });
  const requeue: ReclaimedRun[] = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r.reclaims >= MAX_RECLAIMS) {
      const failed = await prisma.fanoutRun.updateMany({
        where: {
          id: r.id,
          reclaims: {
            gte: MAX_RECLAIMS,
          },
          ...expired,
        },
        data: {
          status: 'FAILED',
          finishedAt: now,
        },
      });
      if (failed.count > 0) console.error(`[fanout] ${r.kind} ${r.subjectId} stopped after ${MAX_RECLAIMS} reclaims`);
      continue;
    }
    const bumped = await prisma.fanoutRun.updateMany({
      where: {
        id: r.id,
        reclaims: r.reclaims,
        ...expired,
      },
      data: {
        reclaims: {
          increment: 1,
        },
      },
    });
    if (bumped.count > 0)
      requeue.push({
        kind: r.kind as FanoutKind,
        subjectId: r.subjectId,
      });
  }
  return requeue;
}

/** The admin jobs console line: runs in flight and runs that failed in the last seven days. Numbers only. */
export async function fanoutSummary(now: Date = new Date()): Promise<{
  running: number;
  failedLast7Days: number;
}> {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [running, failed] = await Promise.all([
    prisma.fanoutRun.count({
      where: {
        status: 'RUNNING',
      },
    }),
    prisma.fanoutRun.count({
      where: {
        status: 'FAILED',
        finishedAt: {
          gte: since,
        },
      },
    }),
  ]);
  return {
    running,
    failedLast7Days: failed,
  };
}
