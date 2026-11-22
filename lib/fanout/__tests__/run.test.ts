import { beforeEach, describe, expect, it, vi } from 'vitest';

// Durable fan-outs: the lease claim, batches and the cursor, the progress compare-and-set, a lost lease, resume from
// the cursor, a resumed batch skipping members already told, the reclaim sweep and DONE being idempotent.

type Run = {
  id: string;
  kind: string;
  subjectId: string;
  cursor: string | null;
  sent: number;
  collapsed: number;
  scanned: number;
  status: 'RUNNING' | 'DONE' | 'FAILED';
  heartbeatAt: Date;
  reclaims: number;
  claimedAt?: Date | null;
  reclaimedAt?: Date | null;
  startedAt: Date;
  finishedAt: Date | null;
};
type Note = {
  userId: string;
  type: string;
  entityType: string;
  entityId: string;
  link: string;
  createdAt: Date;
};

const h = vi.hoisted(() => ({
  runs: [] as Run[],
  notes: [] as Note[],
  seq: 0,
  /** Runs a hook between a batch and its progress write, to simulate another runner taking the lease. */
  beforeProgress: null as null | (() => void),
}));

function matches(r: Run, where: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === 'heartbeatAt' && v && typeof v === 'object' && 'lt' in v) {
      if (
        !(
          r.heartbeatAt.getTime() <
          (
            v as {
              lt: Date;
            }
          ).lt.getTime()
        )
      )
        return false;
    } else if (k === 'reclaims' && v && typeof v === 'object' && 'gte' in v) {
      if (
        !(
          r.reclaims >=
          (
            v as {
              gte: number;
            }
          ).gte
        )
      )
        return false;
    } else if (v instanceof Date) {
      const cur = (r as unknown as Record<string, unknown>)[k];
      if (!(cur instanceof Date) || cur.getTime() !== v.getTime()) return false;
    } else if (v === null) {
      if (((r as unknown as Record<string, unknown>)[k] ?? null) !== null) return false;
    } else if ((r as unknown as Record<string, unknown>)[k] !== v) return false;
  }
  return true;
}

const prismaMock = vi.hoisted(() => ({
  fanoutRun: {
    createMany: vi.fn(async ({ data }: { data: Partial<Run>[] }) => {
      let count = 0;
      for (const d of data) {
        if (h.runs.some((r) => r.kind === d.kind && r.subjectId === d.subjectId)) continue;
        h.runs.push({
          id: `r${++h.seq}`,
          cursor: null,
          sent: 0,
          collapsed: 0,
          scanned: 0,
          reclaims: 0,
          claimedAt: null,
          reclaimedAt: null,
          finishedAt: null,
          status: 'RUNNING',
          heartbeatAt: new Date(),
          startedAt: new Date(),
          ...d,
        } as Run);
        count++;
      }
      return {
        count,
      };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (data.cursor !== undefined && h.beforeProgress) {
        const hook = h.beforeProgress;
        h.beforeProgress = null;
        hook();
      }
      let count = 0;
      for (const r of h.runs) {
        if (!matches(r, where)) continue;
        for (const [k, v] of Object.entries(data)) {
          const rec = r as unknown as Record<string, unknown>;
          if (v && typeof v === 'object' && 'increment' in v)
            rec[k] =
              (rec[k] as number) +
              (
                v as {
                  increment: number;
                }
              ).increment;
          else rec[k] = v;
        }
        count++;
      }
      return {
        count,
      };
    }),
    findUnique: vi.fn(
      async ({
        where,
      }: {
        where: {
          kind_subjectId: {
            kind: string;
            subjectId: string;
          };
        };
      }) => {
        const r = h.runs.find(
          (x) => x.kind === where.kind_subjectId.kind && x.subjectId === where.kind_subjectId.subjectId,
        );
        return r
          ? {
              ...r,
            }
          : null;
      },
    ),
    findMany: vi.fn(async ({ where, take }: { where: Record<string, unknown>; take: number }) =>
      h.runs
        .filter((r) => matches(r, where))
        .slice(0, take)
        .map((r) => ({
          ...r,
        })),
    ),
    count: vi.fn(async () => 0),
  },
  notification: {
    findMany: vi.fn(
      async ({
        where,
      }: {
        where: {
          userId: {
            in: string[];
          };
          type: string;
          createdAt: {
            gte: Date;
          };
        };
      }) =>
        h.notes.filter(
          (n) => where.userId.in.includes(n.userId) && n.type === where.type && n.createdAt >= where.createdAt.gte,
        ),
    ),
  },
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: prismaMock,
}));

import { NO_WORKER_AFTER_MS } from '@/lib/jobs/lease';
import { LEASE_MS, MAX_RECLAIMS, reclaimStalledFanouts, runFanout, type FanoutSpec } from '@/lib/fanout/run.server';

const NOW = new Date('2026-12-01T12:00:00Z');
const AUDIENCE = Array.from(
  {
    length: 10,
  },
  (_, i) => `u${String(i).padStart(2, '0')}`,
);
const BATCH = 4;

/** A fan-out over AUDIENCE in batches of 4 that records who it sent to (and writes the notification, as production does). */
function spec(over: Partial<FanoutSpec> = {}, sentTo: string[] = []): FanoutSpec {
  return {
    kind: 'post-alert',
    subjectId: 'p1',
    delivery: {
      type: 'SYSTEM',
      entityType: 'community_post',
      entityId: 'c1',
      link: '/u/ada/post/p1',
    },
    async step(cursor) {
      const rest = AUDIENCE.filter((id) => cursor === null || id > cursor);
      const ids = rest.slice(0, BATCH);
      return {
        recipients: ids,
        collapse: [],
        lastId: ids[ids.length - 1] ?? null,
        scanned: ids.length,
        done: rest.length <= BATCH,
      };
    },
    async send(recipients) {
      for (const userId of recipients) {
        sentTo.push(userId);
        h.notes.push({
          userId,
          type: 'SYSTEM',
          entityType: 'community_post',
          entityId: 'c1',
          link: '/u/ada/post/p1',
          createdAt: new Date(),
        });
      }
    },
    ...over,
  };
}

const run = () => h.runs[0]!;

beforeEach(() => {
  h.runs = [];
  h.notes = [];
  h.seq = 0;
  h.beforeProgress = null;
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('runFanout', () => {
  it('claims the run, sends in batches, writes the cursor and counters and finishes DONE', async () => {
    const sentTo: string[] = [];
    const totals = await runFanout(spec({}, sentTo), NOW);
    expect(sentTo).toEqual(AUDIENCE);
    expect(totals).toEqual({
      sent: 10,
      collapsed: 0,
    });
    expect(run()).toMatchObject({
      status: 'DONE',
      cursor: 'u09',
      sent: 10,
      scanned: 10,
    });
    expect(run().finishedAt).toBeInstanceOf(Date);
  });

  it('writes every progress update as a compare-and-set on the lease it holds', async () => {
    await runFanout(spec(), NOW);
    const progress = prismaMock.fanoutRun.updateMany.mock.calls.filter(([a]) => 'cursor' in a.data);
    expect(progress).toHaveLength(3);
    for (const [a] of progress) {
      expect(a.where).toMatchObject({
        status: 'RUNNING',
      });
      expect(a.where.heartbeatAt).toBeInstanceOf(Date);
    }
  });

  it('does nothing for a run that is already DONE (a duplicated job)', async () => {
    const sentTo: string[] = [];
    await runFanout(spec({}, sentTo), NOW);
    expect(await runFanout(spec({}, sentTo), NOW)).toBeNull();
    expect(sentTo).toHaveLength(10);
  });

  it('does nothing while another runner holds a live lease', async () => {
    await prismaMock.fanoutRun.createMany({
      data: [
        {
          kind: 'post-alert',
          subjectId: 'p1',
          heartbeatAt: new Date(NOW.getTime() - 1000),
        },
      ],
    });
    const sentTo: string[] = [];
    expect(await runFanout(spec({}, sentTo), NOW)).toBeNull();
    expect(sentTo).toEqual([]);
  });

  it('stops at the next batch when it lost the lease, and a second runner continues after the cursor', async () => {
    const sentTo: string[] = [];
    // After the first batch is sent, another runner takes the lease (its heartbeat changes).
    h.beforeProgress = () => {
      run().heartbeatAt = new Date(run().heartbeatAt.getTime() + 5);
    };
    expect(await runFanout(spec({}, sentTo), NOW)).toBeNull();
    expect(sentTo).toEqual(AUDIENCE.slice(0, 4));
    expect(run()).toMatchObject({
      status: 'RUNNING',
      cursor: null,
      sent: 0,
    });
  });

  it('resumes from the cursor after the lease expired, and a resumed first batch skips members already told', async () => {
    const sentTo: string[] = [];
    // The first runner sent u00-u03 and u04-u05 of the second batch, then died before the second progress write.
    await prismaMock.fanoutRun.createMany({
      data: [
        {
          kind: 'post-alert',
          subjectId: 'p1',
          cursor: 'u03',
          sent: 4,
          scanned: 4,
          heartbeatAt: new Date(NOW.getTime() - LEASE_MS - 1),
          startedAt: new Date(NOW.getTime() - 60_000),
        },
      ],
    });
    for (const id of ['u04', 'u05']) {
      h.notes.push({
        userId: id,
        type: 'SYSTEM',
        entityType: 'community_post',
        entityId: 'c1',
        link: '/u/ada/post/p1',
        createdAt: new Date(NOW.getTime() - 30_000),
      });
    }
    const totals = await runFanout(spec({}, sentTo), NOW);
    expect(sentTo).toEqual(['u06', 'u07', 'u08', 'u09']);
    expect(totals).toEqual({
      sent: 10,
      collapsed: 0,
    });
    expect(run()).toMatchObject({
      status: 'DONE',
      cursor: 'u09',
      scanned: 10,
    });
  });

  it('does not count a notification from before the run started as already told', async () => {
    await prismaMock.fanoutRun.createMany({
      data: [
        {
          kind: 'post-alert',
          subjectId: 'p1',
          cursor: 'u03',
          sent: 4,
          scanned: 4,
          heartbeatAt: new Date(NOW.getTime() - LEASE_MS - 1),
          startedAt: new Date(NOW.getTime() - 60_000),
        },
      ],
    });
    h.notes.push({
      userId: 'u04',
      type: 'SYSTEM',
      entityType: 'community_post',
      entityId: 'c1',
      link: '/u/ada/post/p1',
      createdAt: new Date(NOW.getTime() - 3_600_000),
    });
    const sentTo: string[] = [];
    await runFanout(spec({}, sentTo), NOW);
    expect(sentTo).toContain('u04');
  });

  it('a throw gives the lease back so the retry resumes after the last written batch, telling nobody twice', async () => {
    const sentTo: string[] = [];
    let calls = 0;
    const flaky = spec(
      {
        async send(recipients) {
          if (++calls === 3) throw new Error('db down');
          await spec({}, sentTo).send(recipients, []);
        },
      },
      sentTo,
    );
    await expect(runFanout(flaky, NOW)).rejects.toThrow('db down');
    expect(run()).toMatchObject({
      status: 'RUNNING',
      cursor: 'u07',
    });
    const totals = await runFanout(spec({}, sentTo), new Date(NOW.getTime() + 1000));
    expect(totals).toEqual({
      sent: 10,
      collapsed: 0,
    });
    expect([...sentTo].sort()).toEqual(AUDIENCE);
  });

  it('logs the kind and subject only', async () => {
    const err = console.error as unknown as ReturnType<typeof vi.fn>;
    await expect(
      runFanout(
        spec({
          async step() {
            throw new Error('boom for someone@example.test');
          },
        }),
        NOW,
      ),
    ).rejects.toThrow();
    const logged = JSON.stringify(err.mock.calls);
    expect(logged).toContain('post-alert p1');
  });
});

describe('reclaimStalledFanouts', () => {
  const stale = (over: Partial<Run> = {}) =>
    prismaMock.fanoutRun.createMany({
      data: [
        {
          kind: 'post-alert',
          subjectId: 'p1',
          heartbeatAt: new Date(NOW.getTime() - LEASE_MS - 1000),
          ...over,
        },
      ],
    });

  it('re-queues a run whose lease is older than two minutes and counts the reclaim', async () => {
    await stale();
    expect(await reclaimStalledFanouts(NOW)).toEqual([
      {
        kind: 'post-alert',
        subjectId: 'p1',
      },
    ]);
    expect(run().reclaims).toBe(1);
  });

  it('leaves a run with a live lease and a finished run alone', async () => {
    await stale({
      heartbeatAt: new Date(NOW.getTime() - 30_000),
    });
    await stale({
      subjectId: 'p2',
      status: 'DONE',
    });
    expect(await reclaimStalledFanouts(NOW)).toEqual([]);
    expect(h.runs.map((r) => r.reclaims)).toEqual([0, 0]);
  });

  it('fails the run after the fifth reclaim and queues it no more', async () => {
    await stale({
      reclaims: MAX_RECLAIMS,
    });
    expect(await reclaimStalledFanouts(NOW)).toEqual([]);
    expect(run()).toMatchObject({
      status: 'FAILED',
    });
    expect(run().finishedAt).toBeInstanceOf(Date);
    expect(await runFanout(spec(), NOW)).toBeNull();
  });

  it('ten passes with no runner in between count at most one and leave the run RUNNING', async () => {
    await stale({ claimedAt: new Date(NOW.getTime() - LEASE_MS - 5000) });
    for (let i = 0; i < 10; i++) {
      expect(await reclaimStalledFanouts(new Date(NOW.getTime() + i * 60_000))).toEqual([
        { kind: 'post-alert', subjectId: 'p1' },
      ]);
    }
    expect(run().reclaims).toBe(1);
    expect(run().status).toBe('RUNNING');
  });

  it('five real attempts that each die fail the run and it shows as FAILED', async () => {
    await stale({ claimedAt: new Date(NOW.getTime() - LEASE_MS - 5000) });
    let t = NOW.getTime();
    for (let attempt = 1; attempt <= MAX_RECLAIMS; attempt++) {
      t += 5 * 60_000;
      const at = new Date(t);
      // A runner starts (the claim stamps claimedAt) and dies: the heartbeat goes stale again.
      run().claimedAt = new Date(t - 60_000);
      run().heartbeatAt = new Date(t - LEASE_MS - 1000);
      expect(await reclaimStalledFanouts(at)).toHaveLength(1);
      expect(run().reclaims).toBe(attempt);
    }
    t += 5 * 60_000;
    run().claimedAt = new Date(t - 60_000);
    run().heartbeatAt = new Date(t - LEASE_MS - 1000);
    expect(await reclaimStalledFanouts(new Date(t))).toEqual([]);
    expect(run().status).toBe('FAILED');
  });

  it('a runner that claims through runFanout stamps claimedAt, so its death is counted', async () => {
    await stale({ reclaimedAt: new Date(NOW.getTime() - 60_000), reclaims: 1 });
    expect(await reclaimStalledFanouts(NOW)).toHaveLength(1);
    expect(run().reclaims).toBe(1);
    await runFanout(spec(), NOW);
    expect(run().claimedAt).toBeInstanceOf(Date);
  });

  it('a run that waited a day with no runner fails; one just under a day is queued', async () => {
    await stale({
      heartbeatAt: new Date(NOW.getTime() - NO_WORKER_AFTER_MS - 1000),
      claimedAt: new Date(NOW.getTime() - NO_WORKER_AFTER_MS - 5000),
      reclaimedAt: new Date(NOW.getTime() - NO_WORKER_AFTER_MS),
      reclaims: 1,
    });
    await stale({
      subjectId: 'p2',
      heartbeatAt: new Date(NOW.getTime() - NO_WORKER_AFTER_MS + 120_000),
      claimedAt: new Date(NOW.getTime() - NO_WORKER_AFTER_MS + 60_000),
      reclaimedAt: new Date(NOW.getTime() - NO_WORKER_AFTER_MS + 120_000),
    });
    expect(await reclaimStalledFanouts(NOW)).toEqual([{ kind: 'post-alert', subjectId: 'p2' }]);
    expect(h.runs.map((r) => r.status)).toEqual(['FAILED', 'RUNNING']);
  });

  it('two reclaimers that read the same run count the attempt once', async () => {
    await stale({ claimedAt: new Date(NOW.getTime() - LEASE_MS - 5000) });
    const [a, b] = await Promise.all([reclaimStalledFanouts(NOW), reclaimStalledFanouts(NOW)]);
    expect(run().reclaims).toBe(1);
    expect(a.length + b.length).toBe(1);
  });

  it('a run from before the migration (no claimedAt) is judged as claimed at its heartbeat', async () => {
    await stale();
    await reclaimStalledFanouts(NOW);
    expect(run().reclaims).toBe(1);
    await reclaimStalledFanouts(new Date(NOW.getTime() + 60_000));
    expect(run().reclaims).toBe(1);
  });
});
