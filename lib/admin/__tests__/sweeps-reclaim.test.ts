import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSweepDb } from './sweeps-fake-db';

/**
 * Spam sweeps that wait for the worker (s09-13): a reclaim counts only when a runner started the sweep since the
 * last one; a sweep nobody picks up for a day is stopped; every item row is written before its removal, so undo
 * knows about a removal a dying worker never confirmed; and the hourly confirm cap is one global lock.
 * `moderateContent` cannot run in a caller's transaction (it writes through the global client), so the
 * implementation writes the item row `pending` first and confirms it after: that is what these tests pin.
 */

const h = vi.hoisted(() => ({
  db: null as unknown,
  locks: [] as string[],
  audits: [] as { adminId: string; action: string; detail?: string }[],
  notices: [] as Record<string, unknown>[],
  feedEvents: [] as unknown[],
  moderate: [] as Record<string, unknown>[],
  overturned: [] as Record<string, unknown>[],
  strikes: [] as Record<string, unknown>[],
  afterRemove: null as null | ((n: number) => void),
  beforeRemove: null as null | ((id: string) => void),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: new Proxy({}, { get: (_t, key) => (h.db as Record<string | symbol, unknown>)[key] }),
}));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: vi.fn(async (_tx: unknown, key: string) => {
    h.locks.push(key);
  }),
}));
vi.mock('@/lib/admin-audit.server', () => ({
  recordAdminActionIn: vi.fn(async (_tx: unknown, adminId: string, action: string, opts: { detail?: string }) => {
    h.audits.push({ adminId, action, ...(opts.detail ? { detail: opts.detail } : {}) });
  }),
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (n: Record<string, unknown>) => {
    h.notices.push(n);
  }),
}));
vi.mock('@/lib/feed-sse', () => ({
  feedEventBus: { publishPostEngagement: vi.fn((_p: string, e: unknown) => h.feedEvents.push(e)) },
}));
vi.mock('@/lib/moderation/restrictions.server', () => ({ ACCOUNT_STATUS_LINK: '/settings/account-status' }));
vi.mock('@/lib/moderation/standing.server', () => ({ countActiveStrikes: vi.fn(async () => 1) }));
vi.mock('@/lib/moderation/strikes.server', () => ({
  issueStrike: vi.fn(async (s: Record<string, unknown>) => {
    h.strikes.push(s);
    return { strikeId: 'strike-1', activeStrikes: 1, autoBanned: false };
  }),
  overturnStrike: vi.fn(async (s: Record<string, unknown>) => {
    h.overturned.push(s);
    return { overturned: true, banLifted: false };
  }),
}));
vi.mock('@/lib/moderation/content.server', () => {
  class ModerationError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    ModerationError,
    moderateContent: vi.fn(async (input: Record<string, unknown>) => {
      h.moderate.push(input);
      if (input.action === 'remove') h.beforeRemove?.(String(input.entityId));
      type Rows = { id: string; deletedAt: Date | null; deletedBy: string | null; deletedByAdmin: boolean }[];
      const db = h.db as { __state: { rMHark: Rows; rMHarkComment: Rows } };
      const rows = input.entityType === 'rmhark' ? db.__state.rMHark : db.__state.rMHarkComment;
      const row = rows.find((r) => r.id === input.entityId);
      if (!row) throw new ModerationError(404, 'Content not found');
      if (input.action === 'remove') {
        if (row.deletedAt && row.deletedByAdmin) throw new ModerationError(409, 'already removed');
        row.deletedAt = row.deletedAt ?? new Date();
        row.deletedBy = 'moderator';
        row.deletedByAdmin = true;
        h.afterRemove?.(h.moderate.filter((m) => m.action === 'remove').length);
      } else {
        if (!row.deletedByAdmin) throw new ModerationError(409, 'not removed by moderation');
        row.deletedAt = null;
        row.deletedBy = null;
        row.deletedByAdmin = false;
      }
      return { success: true };
    }),
  };
});
const boss = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/jobs/boss.server', () => ({ getBoss: vi.fn(async () => boss.current) }));

import {
  SWEEP_CONFIRM_CAP_LOCK,
  SWEEP_LEASE_MS,
  SWEEP_MAX_RECLAIMS,
  SweepRefused,
  confirmSweep,
  createSweepPreview,
  reclaimStalledSweeps,
  runSweep,
  settlePendingItems,
  undoSweep,
} from '@/lib/admin/sweeps.server';
import { NO_WORKER_AFTER_MS, NO_WORKER_ERROR } from '@/lib/jobs/lease';
import { SWEEP_CONFIRMS_PER_HOUR } from '@/lib/admin/sweeps';

type Row = Record<string, unknown>;
let fake: ReturnType<typeof createSweepDb>;
const NOW = new Date('2026-11-28T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const sweep = (id = 'sw1') => fake.state.moderationSweep.find((s) => s.id === id)!;

function post(id: string, minutes: number, over: Row = {}): Row {
  return {
    id,
    userId: 'spammer',
    content: `buy ${id}`,
    createdAt: minutesAgo(minutes),
    deletedAt: null,
    deletedBy: null,
    deletedByAdmin: false,
    likeCount: 0,
    ...over,
  };
}

function seed(opts: { posts?: Row[]; replies?: Row[]; sweeps?: Row[]; users?: Row[] } = {}) {
  fake = createSweepDb({
    user: opts.users ?? [
      {
        id: 'admin',
        isAdmin: true,
        name: 'Ada',
        handle: 'ada',
        username: null,
        banReason: null,
        createdAt: minutesAgo(10_000_000),
      },
      {
        id: 'admin2',
        isAdmin: true,
        name: 'Bo',
        handle: 'bo',
        username: null,
        banReason: null,
        createdAt: minutesAgo(10_000_000),
      },
      {
        id: 'spammer',
        isAdmin: false,
        name: 'Spam',
        handle: 'spam',
        username: null,
        banReason: null,
        createdAt: minutesAgo(60 * 24 * 3),
      },
    ],
    rMHark: opts.posts ?? [],
    rMHarkComment: opts.replies ?? [],
    moderationSweep: opts.sweeps ?? [],
  });
  h.db = Object.assign(fake.db, { __state: fake.state });
}

/** A sweep row, as it would be after a confirm. */
function sweepRow(over: Row = {}): Row {
  return {
    id: 'sw1',
    subjectId: 'spammer',
    adminId: 'admin',
    windowFrom: minutesAgo(60 * 24),
    windowTo: NOW,
    includePosts: true,
    includeReplies: true,
    reason: 'Spam wave of links',
    withStrike: false,
    strikeId: null,
    status: 'RUNNING',
    phase: 'remove',
    postCount: 0,
    replyCount: 0,
    removedCount: 0,
    restoredCount: 0,
    error: null,
    createdAt: minutesAgo(5),
    confirmedAt: minutesAgo(5),
    queuedAt: minutesAgo(5),
    finishedAt: null,
    undoneAt: null,
    undoneById: null,
    heartbeatAt: null,
    reclaims: 0,
    cursorType: null,
    cursorAt: null,
    cursorId: null,
    ...over,
  };
}

const body = (over: Record<string, unknown> = {}) => ({
  subjectId: 'spammer',
  includePosts: true,
  includeReplies: true,
  reason: 'Spam wave of links',
  strike: false,
  ...over,
});

async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (error) {
    if (error instanceof SweepRefused) return error.reason;
    throw error;
  }
  return 'none';
}

beforeEach(() => {
  // A frozen clock: every `new Date()` in the code under test is NOW.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  h.locks.length = 0;
  h.audits.length = 0;
  h.notices.length = 0;
  h.feedEvents.length = 0;
  h.moderate.length = 0;
  h.overturned.length = 0;
  h.strikes.length = 0;
  h.afterRemove = null;
  h.beforeRemove = null;
  boss.current = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  seed();
});

const stale = (over: Row = {}) => sweepRow({ heartbeatAt: new Date(NOW.getTime() - SWEEP_LEASE_MS - 1000), ...over });

/** A runner took the lease and died: the claim stamps `claimedAt` and the heartbeat goes stale. */
function runnerStartedAndDied(at: Date) {
  sweep().claimedAt = new Date(at.getTime() - 60_000);
  sweep().heartbeatAt = new Date(at.getTime() - SWEEP_LEASE_MS - 1000);
}

describe('sweep reclaims count attempts, not minutes', () => {
  it('ten passes with no runner in between count at most one and leave the sweep RUNNING', async () => {
    seed({ sweeps: [stale({ claimedAt: minutesAgo(10) })] });
    for (let i = 0; i < 10; i++) {
      expect(await reclaimStalledSweeps(new Date(NOW.getTime() + i * 60_000))).toEqual(['sw1']);
    }
    expect(sweep().reclaims).toBe(1);
    expect(sweep().status).toBe('RUNNING');
  });

  it('a sweep queued by a confirm and never claimed is queued again for ever without counting', async () => {
    seed({ sweeps: [sweepRow({ queuedAt: minutesAgo(30), heartbeatAt: null })] });
    for (let i = 0; i < 10; i++) await reclaimStalledSweeps(new Date(NOW.getTime() + i * 60_000));
    expect(sweep().reclaims).toBe(0);
    expect(sweep().status).toBe('RUNNING');
  });

  it('five real attempts that each die fail the sweep on the next pass', async () => {
    seed({ sweeps: [sweepRow()] });
    let at = NOW;
    for (let attempt = 1; attempt <= SWEEP_MAX_RECLAIMS; attempt++) {
      at = new Date(at.getTime() + 5 * 60_000);
      runnerStartedAndDied(at);
      expect(await reclaimStalledSweeps(at)).toEqual(['sw1']);
      expect(sweep().reclaims).toBe(attempt);
    }
    at = new Date(at.getTime() + 5 * 60_000);
    runnerStartedAndDied(at);
    expect(await reclaimStalledSweeps(at)).toEqual([]);
    expect(sweep().status).toBe('FAILED');
  });

  it('a run from before the migration (no claimedAt) is judged as claimed at its heartbeat', async () => {
    seed({ sweeps: [stale()] });
    await reclaimStalledSweeps(NOW);
    expect(sweep().reclaims).toBe(1);
    await reclaimStalledSweeps(new Date(NOW.getTime() + 60_000));
    expect(sweep().reclaims).toBe(1);
  });

  it('stops a sweep nobody picked up for a day', async () => {
    seed({
      sweeps: [
        sweepRow({
          heartbeatAt: new Date(NOW.getTime() - NO_WORKER_AFTER_MS - 1000),
          claimedAt: new Date(NOW.getTime() - NO_WORKER_AFTER_MS - 5000),
          reclaimedAt: new Date(NOW.getTime() - NO_WORKER_AFTER_MS),
          reclaims: 1,
        }),
      ],
    });
    expect(await reclaimStalledSweeps(NOW)).toEqual([]);
    expect(sweep().status).toBe('FAILED');
    expect(sweep().error).toBe(NO_WORKER_ERROR);
  });

  it('two reclaimers that read the same sweep count the attempt once', async () => {
    seed({ sweeps: [stale({ claimedAt: minutesAgo(10) })] });
    const [a, b] = await Promise.all([reclaimStalledSweeps(NOW), reclaimStalledSweeps(NOW)]);
    expect(sweep().reclaims).toBe(1);
    expect(a.length + b.length).toBe(1);
  });

  it('the claim stamps claimedAt', async () => {
    seed({ posts: [post('p1', 10)], sweeps: [sweepRow({ postCount: 1 })] });
    await runSweep('sw1', NOW);
    expect(sweep().claimedAt).toEqual(NOW);
  });

  it('confirm and undo start a fresh attempt count', async () => {
    seed({ posts: [post('p1', 10)] });
    const { sweep: s } = await createSweepPreview('admin', body(), NOW);
    await confirmSweep('admin', s.id);
    expect(sweep(s.id)).toMatchObject({ claimedAt: null, reclaimedAt: null, reclaims: 0 });
    sweep(s.id).claimedAt = minutesAgo(1);
    sweep(s.id).reclaimedAt = minutesAgo(2);
    sweep(s.id).status = 'DONE';
    sweep(s.id).removedCount = 1;
    await undoSweep('admin', s.id);
    expect(sweep(s.id)).toMatchObject({ claimedAt: null, reclaimedAt: null, reclaims: 0, phase: 'undo' });
  });
});

describe('the item row is written before the removal', () => {
  it('has a pending row when the removal starts and a confirmed one when the batch ends', async () => {
    seed({ posts: [post('p1', 10)], sweeps: [sweepRow({ postCount: 1 })] });
    const seen: unknown[] = [];
    h.beforeRemove = () => seen.push(...fake.state.moderationSweepItem.map((i) => ({ ...i })));
    await runSweep('sw1', NOW);
    expect(seen).toMatchObject([{ entityId: 'p1', undone: 'pending' }]);
    expect(fake.state.moderationSweepItem).toMatchObject([{ entityId: 'p1', undone: null }]);
    expect(sweep().removedCount).toBe(1);
  });

  it('drops the row of an item the removal did not take', async () => {
    seed({ posts: [post('p1', 10)], sweeps: [sweepRow({ postCount: 1 })] });
    h.beforeRemove = (id) => {
      // The author deletes it in the same instant: the sweep must not own that deletion.
      const p = fake.state.rMHark.find((r) => r.id === id)!;
      p.deletedAt = new Date(NOW.getTime() - 1000);
      p.deletedBy = 'author';
      p.deletedByAdmin = false;
    };
    await runSweep('sw1', NOW);
    expect(fake.state.moderationSweepItem).toHaveLength(0);
    expect(sweep().removedCount).toBe(0);
  });

  it('a crash after the item row and before the removal: the resumed run removes it and records it once', async () => {
    seed({
      posts: [post('p1', 10), post('p2', 11)],
      sweeps: [sweepRow({ postCount: 2, claimedAt: minutesAgo(4), heartbeatAt: minutesAgo(3) })],
    });
    fake.state.moderationSweepItem.push({
      sweepId: 'sw1',
      entityType: 'rmhark',
      entityId: 'p1',
      removedAt: minutesAgo(3),
      undone: 'pending',
    });
    await runSweep('sw1', NOW);
    expect(sweep().status).toBe('DONE');
    expect(sweep().removedCount).toBe(2);
    expect(fake.state.moderationSweepItem.map((i) => [i.entityId, i.undone]).sort()).toEqual([
      ['p1', null],
      ['p2', null],
    ]);
  });

  it('a crash after the removal and before the confirm: undo restores the item', async () => {
    seed({
      posts: [
        post('p1', 10, { deletedAt: minutesAgo(3), deletedBy: 'moderator', deletedByAdmin: true }),
        post('p2', 11, { deletedAt: minutesAgo(3), deletedBy: 'moderator', deletedByAdmin: true }),
      ],
      sweeps: [sweepRow({ postCount: 2, status: 'FAILED', removedCount: 1, finishedAt: minutesAgo(1) })],
    });
    fake.state.moderationSweepItem.push(
      { sweepId: 'sw1', entityType: 'rmhark', entityId: 'p1', removedAt: minutesAgo(3), undone: null },
      { sweepId: 'sw1', entityType: 'rmhark', entityId: 'p2', removedAt: minutesAgo(4), undone: 'pending' },
    );
    await undoSweep('admin', 'sw1', NOW);
    await runSweep('sw1', NOW);
    expect(sweep().status).toBe('UNDONE');
    expect(fake.state.rMHark.every((p) => p.deletedAt === null)).toBe(true);
    expect(sweep().restoredCount).toBe(2);
  });

  it('settling drops a pending row whose content was never removed, or removed by someone else', async () => {
    seed({
      posts: [
        post('live', 10),
        post('author', 11, { deletedAt: minutesAgo(1), deletedBy: 'author' }),
        post('mod', 12, { deletedAt: minutesAgo(1), deletedBy: 'moderator', deletedByAdmin: true }),
      ],
      sweeps: [sweepRow()],
    });
    for (const id of ['live', 'author', 'mod'])
      fake.state.moderationSweepItem.push({
        sweepId: 'sw1',
        entityType: 'rmhark',
        entityId: id,
        removedAt: minutesAgo(3),
        undone: 'pending',
      });
    expect(await settlePendingItems('sw1')).toBe(1);
    expect(fake.state.moderationSweepItem.map((i) => [i.entityId, i.undone])).toEqual([['mod', null]]);
  });

  it('drops a pending row whose removal another moderator made, found by their audit row', async () => {
    seed({
      posts: [post('mod', 12, { deletedAt: minutesAgo(1), deletedBy: 'moderator', deletedByAdmin: true })],
      sweeps: [sweepRow()],
    });
    fake.state.moderationSweepItem.push({
      sweepId: 'sw1',
      entityType: 'rmhark',
      entityId: 'mod',
      removedAt: minutesAgo(3),
      undone: 'pending',
    });
    fake.state.adminAuditLog.push({
      action: 'content.remove',
      targetType: 'rmhark',
      targetId: 'mod',
      createdAt: minutesAgo(1),
    });
    expect(await settlePendingItems('sw1')).toBe(0);
    expect(fake.state.moderationSweepItem).toEqual([]);
  });
});

describe('the confirm cap holds across subjects', () => {
  it('takes one global lock before the subject lock', async () => {
    seed({ posts: [post('p1', 10)] });
    const { sweep: s } = await createSweepPreview('admin', body(), NOW);
    await confirmSweep('admin', s.id, NOW);
    expect(h.locks).toEqual([SWEEP_CONFIRM_CAP_LOCK, 'sweep:spammer']);
    expect(SWEEP_CONFIRM_CAP_LOCK).toBe('sweeps:confirm-cap');
  });

  it('counts the confirms made against other subjects', async () => {
    seed({ posts: [post('p1', 10)] });
    const { sweep: s } = await createSweepPreview('admin', body(), NOW);
    for (let i = 0; i < SWEEP_CONFIRMS_PER_HOUR; i++) {
      fake.state.moderationSweep.push(
        sweepRow({ id: `other${i}`, subjectId: `someone${i}`, status: 'DONE', confirmedAt: minutesAgo(5 + i) }),
      );
    }
    expect(await refusal(confirmSweep('admin', s.id, NOW))).toBe('confirm-limit');
    expect(sweep(s.id).status).toBe('PREVIEW');
  });
});
