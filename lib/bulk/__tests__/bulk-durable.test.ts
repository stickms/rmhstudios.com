import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, opRow, type FakeState } from './fake-bulk-db';

/**
 * Durable bulk runs: the lease, the persisted cursor, the reclaim sweep and its ceiling, and the queue fallback.
 * Prisma is replaced by an in-memory fake that implements the `where` language the runner uses and rolls an
 * interactive transaction back when it throws, so a chunk really is all or nothing here.
 */

const fake = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: new Proxy({}, { get: (_t, key) => (fake.current as Record<string | symbol, unknown>)[key] }),
}));
vi.mock('@/lib/trash/trash.server', () => ({
  softDeletePostAsAuthor: vi.fn(async () => 'deleted'),
  softDeleteCommentAsAuthor: vi.fn(async () => 'deleted'),
}));
vi.mock('@/lib/social/engagement.server', () => ({ unfollowUser: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/notifications.server', () => ({ adjustNotifUnread: vi.fn(async () => {}) }));
const boss = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/jobs/boss.server', () => ({ getBoss: vi.fn(async () => boss.current) }));

import {
  LEASE_MS,
  MAX_RECLAIMS,
  STALLED_AFTER_MS,
  reclaimStalledOperations,
  runBulkOperation,
} from '@/lib/bulk/bulk.server';
import { REPEATED_RESTARTS_ERROR } from '@/lib/bulk/types';
import { BULK_RUN_QUEUE, enqueueBulkRun } from '@/lib/bulk/queue.server';

let db: ReturnType<typeof createFakeDb>;

function seed(opts: { likes: number; op?: Record<string, unknown> }) {
  const posts = Array.from({ length: opts.likes }, (_, i) => ({
    id: `p${String(i).padStart(3, '0')}`,
    content: `post ${i}`,
    likeCount: 1,
    repostCount: 0,
  }));
  const likes = posts.map((p, i) => ({
    id: `l${String(i).padStart(3, '0')}`,
    rmheetId: p.id,
    userId: 'u1',
    createdAt: new Date('2020-01-01'),
  }));
  const state: Partial<FakeState> = {
    rMHark: posts,
    rMHarkLike: likes,
    bulkOperation: [opRow({ total: opts.likes, ...(opts.op ?? {}) })],
  };
  db = createFakeDb(state);
  fake.current = db.db;
}

const op = () => db.state.bulkOperation[0]!;
const ago = (ms: number) => new Date(Date.now() - ms);

beforeEach(() => {
  boss.current = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the lease claim', () => {
  it('claims a PENDING operation and runs it to DONE', async () => {
    seed({ likes: 250 });
    await runBulkOperation('op1');
    expect(op().status).toBe('DONE');
    expect(op().processed).toBe(250);
    expect(db.state.rMHarkLike).toHaveLength(0);
    expect(op().finishedAt).toBeInstanceOf(Date);
  });

  it('claims a RUNNING operation whose lease expired', async () => {
    seed({ likes: 5, op: { status: 'RUNNING', heartbeatAt: ago(LEASE_MS + 5_000) } });
    await runBulkOperation('op1');
    expect(op().status).toBe('DONE');
    expect(db.state.rMHarkLike).toHaveLength(0);
  });

  it('refuses a RUNNING operation whose lease is live', async () => {
    seed({ likes: 5, op: { status: 'RUNNING', heartbeatAt: ago(10_000), createdAt: ago(60 * 60_000) } });
    await runBulkOperation('op1');
    expect(op().status).toBe('RUNNING');
    expect(op().processed).toBe(0);
    expect(db.state.rMHarkLike).toHaveLength(5);
  });

  it('refuses a finished operation', async () => {
    for (const status of ['DONE', 'CANCELLED', 'FAILED']) {
      seed({ likes: 3, op: { status } });
      await runBulkOperation('op1');
      expect(db.state.rMHarkLike).toHaveLength(3);
    }
  });

  it('lets only one of two concurrent runners advance the operation', async () => {
    seed({ likes: 250 });
    await Promise.all([runBulkOperation('op1'), runBulkOperation('op1')]);
    expect(op().status).toBe('DONE');
    // Counted once: a second runner would have found nothing to delete but would have raced the cursor.
    expect(op().processed).toBe(250);
    expect(db.state.rMHark.every((p) => p.likeCount === 0)).toBe(true);
  });

  it('stops a runner whose lease was taken, and rolls its chunk back', async () => {
    seed({ likes: 150 });
    let taken = false;
    db.hooks.beforeFindMany = (table) => {
      // After the first runner read its chunk, another runner takes the lease.
      if (table === 'rMHarkLike' && !taken) {
        taken = true;
        queueMicrotask(() => {
          op().heartbeatAt = new Date(Date.now() + 1);
        });
      }
    };
    await runBulkOperation('op1');
    expect(op().processed).toBe(0);
    expect(db.state.rMHarkLike).toHaveLength(150);
    expect(db.state.rMHark.every((p) => p.likeCount === 1)).toBe(true);
    expect(op().status).toBe('RUNNING');
  });
});

describe('resuming', () => {
  it('continues strictly after the persisted cursor', async () => {
    // l000..l004 were finished by the run that died; the cursor says so. The first three are gone, two linger
    // (as if rolled forward by a later state) to prove the keyset does not look behind the cursor.
    seed({ likes: 8, op: { status: 'RUNNING', heartbeatAt: ago(LEASE_MS + 1000), cursorId: 'l004', processed: 5 } });
    await runBulkOperation('op1');
    const left = db.state.rMHarkLike.map((l) => l.id);
    expect(left).toEqual(['l000', 'l001', 'l002', 'l003', 'l004']);
    expect(op().status).toBe('DONE');
    expect(op().processed).toBe(8);
  });

  it('persists the cursor and renews the heartbeat with each chunk', async () => {
    seed({ likes: 120 });
    await runBulkOperation('op1');
    expect(op().cursorId).toBe('l119');
    expect(op().heartbeatAt).toBeInstanceOf(Date);
  });

  it('a chunk run again after a crash changes nothing and keeps counters right', async () => {
    seed({ likes: 3 });
    // The previous attempt committed the unlike of l001 (with its decrement) but died before the cursor moved.
    db.state.rMHarkLike = db.state.rMHarkLike.filter((l) => l.id !== 'l001');
    db.state.rMHark.find((p) => p.id === 'p001')!.likeCount = 0;
    await runBulkOperation('op1');
    expect(db.state.rMHark.map((p) => p.likeCount)).toEqual([0, 0, 0]);
    expect(op().processed).toBe(2);
  });

  it('does not double-decrement when a single unlike lands between the read and the delete', async () => {
    seed({ likes: 3 });
    db.hooks.beforeFindMany = (table) => {
      if (table !== 'rMHarkLike') return;
      db.hooks.beforeFindMany = null;
      queueMicrotask(() => {
        db.state.rMHarkLike = db.state.rMHarkLike.filter((l) => l.id !== 'l001');
        db.state.rMHark.find((p) => p.id === 'p001')!.likeCount = 0;
      });
    };
    await runBulkOperation('op1');
    for (const p of db.state.rMHark) expect(p.likeCount).toBe(0);
    expect(op().processed).toBe(2);
  });

  it('observes a cancel during a resumed run within one chunk and rolls that chunk back', async () => {
    seed({
      likes: 250,
      op: { status: 'RUNNING', heartbeatAt: ago(LEASE_MS + 1000), cursorId: 'l049', processed: 50 },
    });
    // Drop the 50 already-finished rows, as the dead run had.
    db.state.rMHarkLike = db.state.rMHarkLike.filter((l) => String(l.id) > 'l049');
    for (const p of db.state.rMHark.slice(0, 50)) p.likeCount = 0;
    let reads = 0;
    db.hooks.beforeFindMany = (table) => {
      if (table !== 'rMHarkLike') return;
      reads += 1;
      if (reads === 2) {
        // The member presses Stop while the second chunk is being read.
        queueMicrotask(() => {
          op().status = 'CANCELLED';
          op().finishedAt = new Date();
        });
      }
    };
    await runBulkOperation('op1');
    expect(op().status).toBe('CANCELLED');
    // Chunk one (l050..l149) is kept; chunk two is rolled back whole.
    expect(db.state.rMHarkLike).toHaveLength(100);
    expect(op().processed).toBe(150);
    expect(db.state.rMHark.filter((p) => p.likeCount === 1)).toHaveLength(100);
  });
});

describe('the reclaim sweep', () => {
  it('queues operations whose lease expired and counts the reclaim', async () => {
    seed({ likes: 1, op: { status: 'RUNNING', heartbeatAt: ago(LEASE_MS + 1000) } });
    const ids = await reclaimStalledOperations();
    expect(ids).toEqual(['op1']);
    expect(op().reclaims).toBe(1);
  });

  it('leaves a healthy long run alone, however old it is', async () => {
    seed({ likes: 1, op: { status: 'RUNNING', heartbeatAt: ago(15_000), createdAt: ago(3 * STALLED_AFTER_MS) } });
    expect(await reclaimStalledOperations()).toEqual([]);
    expect(op().reclaims).toBe(0);
  });

  it('picks up a run from before the lease existed (no heartbeat) once it is older than the stall window', async () => {
    seed({
      likes: 4,
      op: {
        kind: 'unlike-posts',
        status: 'RUNNING',
        heartbeatAt: null,
        createdAt: ago(STALLED_AFTER_MS + 1000),
        processed: 2,
      },
    });
    expect(await reclaimStalledOperations()).toEqual(['op1']);
    await runBulkOperation('op1');
    expect(op().status).toBe('DONE');
  });

  it('does not touch a young run that has no heartbeat yet', async () => {
    seed({ likes: 4, op: { status: 'RUNNING', heartbeatAt: null, createdAt: ago(60_000) } });
    expect(await reclaimStalledOperations()).toEqual([]);
    await runBulkOperation('op1');
    expect(db.state.rMHarkLike).toHaveLength(4);
  });

  it('stops an operation that was reclaimed five times as FAILED', async () => {
    seed({ likes: 2, op: { status: 'RUNNING', heartbeatAt: ago(LEASE_MS + 1000), reclaims: MAX_RECLAIMS } });
    expect(await reclaimStalledOperations()).toEqual([]);
    expect(op().status).toBe('FAILED');
    expect(op().error).toBe(REPEATED_RESTARTS_ERROR);
    expect(op().finishedAt).toBeInstanceOf(Date);
    // And it never loops: a second sweep finds nothing.
    expect(await reclaimStalledOperations()).toEqual([]);
  });

  it('counts the fifth reclaim and fails when the sixth attempt dies too', async () => {
    seed({ likes: 2, op: { status: 'RUNNING', heartbeatAt: ago(LEASE_MS + 1000), reclaims: MAX_RECLAIMS - 1 } });
    expect(await reclaimStalledOperations()).toEqual(['op1']);
    expect(op().reclaims).toBe(MAX_RECLAIMS);
    // No runner started since: the next pass queues it again and counts nothing.
    expect(await reclaimStalledOperations()).toEqual(['op1']);
    expect(op().status).toBe('RUNNING');
    // A runner starts and dies; the pass after it fails the run.
    db.state.bulkOperation[0]!.claimedAt = new Date(Date.now() + 5);
    db.state.bulkOperation[0]!.heartbeatAt = ago(LEASE_MS + 1000);
    expect(await reclaimStalledOperations()).toEqual([]);
    expect(op().status).toBe('FAILED');
  });
});

describe('enqueueBulkRun', () => {
  it('sends only the operation id to the bulk.run queue', async () => {
    seed({ likes: 1 });
    const send = vi.fn(async () => 'job-1');
    boss.current = { send };
    expect(await enqueueBulkRun('op1')).toBe('queued');
    expect(send).toHaveBeenCalledTimes(1);
    const [queue, payload, options] = send.mock.calls[0] as unknown as [string, unknown, Record<string, unknown>];
    expect(queue).toBe(BULK_RUN_QUEUE);
    expect(payload).toEqual({ operationId: 'op1' });
    expect(options.singletonKey).toBe('bulk-run:op1');
    // Nothing ran in this process.
    expect(db.state.rMHarkLike).toHaveLength(1);
  });

  it('falls back to a detached run when the queue is unavailable', async () => {
    seed({ likes: 3 });
    boss.current = null;
    expect(await enqueueBulkRun('op1')).toBe('inline');
    await vi.waitFor(() => expect(op().status).toBe('DONE'));
    expect(db.state.rMHarkLike).toHaveLength(0);
  });

  it('falls back when the queue refuses the job', async () => {
    seed({ likes: 2 });
    boss.current = { send: vi.fn(async () => Promise.reject(new Error('down'))) };
    expect(await enqueueBulkRun('op1')).toBe('inline');
    await vi.waitFor(() => expect(op().status).toBe('DONE'));
  });
});
