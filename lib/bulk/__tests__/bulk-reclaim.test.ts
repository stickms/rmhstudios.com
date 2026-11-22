import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, opRow, type FakeState } from './fake-bulk-db';

/**
 * Reclaims that wait for the worker (s09-13) for bulk clean-ups: a reclaim counts only when a runner started the
 * run since the last one, a run nobody picks up for a day is stopped, and two sweeps never count one attempt twice.
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

import { LEASE_MS, MAX_RECLAIMS, reclaimStalledOperations, runBulkOperation } from '@/lib/bulk/bulk.server';
import { NO_WORKER_AFTER_MS, NO_WORKER_ERROR } from '@/lib/jobs/lease';

let db: ReturnType<typeof createFakeDb>;

function seed(likes: number, op: Record<string, unknown>) {
  const posts = Array.from({ length: likes }, (_, i) => ({
    id: `p${String(i).padStart(4, '0')}`,
    content: `post ${i}`,
    likeCount: 1,
    repostCount: 0,
  }));
  const rows = posts.map((p, i) => ({
    id: `l${String(i).padStart(4, '0')}`,
    rmheetId: p.id,
    userId: 'u1',
    createdAt: new Date('2020-01-01'),
  }));
  const state: Partial<FakeState> = {
    rMHark: posts,
    rMHarkLike: rows,
    bulkOperation: [opRow({ total: likes, ...op })],
  };
  db = createFakeDb(state);
  fake.current = db.db;
}

const op = () => db.state.bulkOperation[0]!;
const ago = (ms: number) => new Date(Date.now() - ms);

/** A runner took the lease and died: `claimedAt` is stamped (as the claim does) and the heartbeat goes stale. */
function runnerStartedAndDied() {
  // A few ms ahead so the claim is strictly later than the pass that just counted, as a minute later would be.
  op().claimedAt = new Date(Date.now() + 5);
  op().heartbeatAt = ago(LEASE_MS + 1000);
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('bulk reclaims count attempts, not minutes', () => {
  it('ten passes with no runner in between count at most one and leave the run RUNNING', async () => {
    seed(1, { status: 'RUNNING', heartbeatAt: ago(LEASE_MS + 1000), claimedAt: ago(LEASE_MS + 5000) });
    const queued: string[][] = [];
    for (let i = 0; i < 10; i++) queued.push(await reclaimStalledOperations());
    expect(op().reclaims).toBeLessThanOrEqual(1);
    expect(op().reclaims).toBe(1);
    expect(op().status).toBe('RUNNING');
    // Every pass queued it again so a worker that comes back finds a job.
    expect(queued.every((ids) => ids.length === 1 && ids[0] === 'op1')).toBe(true);
  });

  it('a run from before the migration (no claimedAt) is judged as claimed at its heartbeat', async () => {
    seed(1, { status: 'RUNNING', heartbeatAt: ago(LEASE_MS + 1000), claimedAt: null });
    await reclaimStalledOperations();
    expect(op().reclaims).toBe(1);
    expect(op().reclaimedAt).toBeInstanceOf(Date);
    await reclaimStalledOperations();
    expect(op().reclaims).toBe(1);
  });

  it('five real attempts that each die fail the run on the next pass', async () => {
    seed(1, { status: 'RUNNING' });
    for (let attempt = 1; attempt <= MAX_RECLAIMS; attempt++) {
      runnerStartedAndDied();
      expect(await reclaimStalledOperations()).toEqual(['op1']);
      expect(op().reclaims).toBe(attempt);
      expect(op().status).toBe('RUNNING');
    }
    runnerStartedAndDied();
    expect(await reclaimStalledOperations()).toEqual([]);
    expect(op().status).toBe('FAILED');
    expect(op().finishedAt).toBeInstanceOf(Date);
  });

  it('a run that waited a day with no runner at all fails with its own message', async () => {
    seed(1, {
      status: 'RUNNING',
      heartbeatAt: ago(NO_WORKER_AFTER_MS + 60_000),
      claimedAt: ago(NO_WORKER_AFTER_MS + 120_000),
      reclaimedAt: ago(NO_WORKER_AFTER_MS),
      reclaims: 1,
    });
    expect(await reclaimStalledOperations()).toEqual([]);
    expect(op().status).toBe('FAILED');
    expect(op().error).toBe(NO_WORKER_ERROR);
  });

  it('just under a day it is still queued', async () => {
    seed(1, {
      status: 'RUNNING',
      heartbeatAt: ago(NO_WORKER_AFTER_MS - 60_000),
      claimedAt: ago(NO_WORKER_AFTER_MS - 120_000),
      reclaimedAt: ago(NO_WORKER_AFTER_MS - 60_000),
    });
    expect(await reclaimStalledOperations()).toEqual(['op1']);
    expect(op().status).toBe('RUNNING');
  });

  it('two reclaimers that read the same row count the attempt once', async () => {
    seed(1, { status: 'RUNNING', heartbeatAt: ago(LEASE_MS + 1000), claimedAt: ago(LEASE_MS + 5000) });
    const [a, b] = await Promise.all([reclaimStalledOperations(), reclaimStalledOperations()]);
    expect(op().reclaims).toBe(1);
    // The loser of the compare-and-set queues nothing: the winner's job is the one in the queue.
    expect([...a, ...b]).toEqual(['op1']);
  });

  it('two reclaimers cannot fail a run that a runner claimed between their read and their write', async () => {
    seed(1, {
      status: 'RUNNING',
      reclaims: MAX_RECLAIMS,
      heartbeatAt: ago(LEASE_MS + 1000),
      claimedAt: ago(LEASE_MS + 5000),
    });
    db.hooks.beforeFindMany = () => {
      db.hooks.beforeFindMany = null;
      // The runner claims right after the reclaimer reads: the row is live again.
      queueMicrotask(() => {
        op().claimedAt = new Date();
        op().heartbeatAt = new Date();
      });
    };
    const ids = await reclaimStalledOperations();
    expect(op().status).toBe('RUNNING');
    expect(ids).toEqual([]);
  });

  it('a worker dying mid-run resumes from its cursor and a later runner finishes it', async () => {
    seed(250, {
      status: 'RUNNING',
      heartbeatAt: ago(LEASE_MS + 1000),
      claimedAt: ago(LEASE_MS + 5000),
      cursorId: 'l0099',
    });
    for (let i = 0; i < 10; i++) await reclaimStalledOperations();
    expect(op().status).toBe('RUNNING');
    await runBulkOperation('op1');
    expect(op().status).toBe('DONE');
    expect(op().claimedAt).toBeInstanceOf(Date);
    expect(op().reclaims).toBe(1);
  });

  it('the claim stamps claimedAt so the next reclaim after a death counts', async () => {
    seed(1, { status: 'RUNNING', heartbeatAt: ago(LEASE_MS + 1000), claimedAt: ago(LEASE_MS + 5000) });
    await reclaimStalledOperations();
    expect(op().reclaims).toBe(1);
    const claimed = op().claimedAt as Date;
    await runBulkOperation('op1');
    expect((op().claimedAt as Date).getTime()).toBeGreaterThan(claimed.getTime());
  });
});
