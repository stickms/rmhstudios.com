import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSweepDb } from './sweeps-fake-db';

/**
 * s10-18: a sweep's removal and its item row stay together. `moderateContent` writes through the global client, so
 * it cannot join a transaction of ours; the item row is written `pending` BEFORE the removal and confirmed after
 * (s09-13), so a failure after the removal always leaves the item recorded. What this change adds: that a thrown
 * error after the removal no longer drops the record, and that a FAILED sweep holding only pending rows counts
 * them (it read "0 removed" and refused undo until settled). Prisma is an in-memory fake.
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
  SWEEP_MAX_RECLAIMS,
  SweepRefused,
  SWEEP_LEASE_MS,
  reclaimStalledSweeps,
  runSweep,
  toSweepView,
  undoSweep,
} from '@/lib/admin/sweeps.server';

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

const failAfterRemoval = () => {
  h.afterRemove = () => {
    throw new Error('database went away');
  };
};

const removedByModerator = (over: Row = {}) => ({
  deletedAt: minutesAgo(3),
  deletedBy: 'moderator',
  deletedByAdmin: true,
  ...over,
});

beforeEach(() => {
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

describe('a failure after the removal leaves the item recorded', () => {
  it('keeps the item row when the run throws right after the content was removed', async () => {
    seed({ posts: [post('p1', 10)], sweeps: [sweepRow({ postCount: 1 })] });
    failAfterRemoval();
    await runSweep('sw1', NOW);
    expect(sweep().status).toBe('FAILED');
    expect(fake.state.rMHark[0]!.deletedAt).not.toBeNull();
    expect(fake.state.moderationSweepItem).toMatchObject([{ sweepId: 'sw1', entityId: 'p1' }]);
  });

  it('still drops the row of a removal that was cleanly refused', async () => {
    seed({
      posts: [post('p1', 10)],
      sweeps: [sweepRow({ postCount: 1 })],
    });
    h.beforeRemove = (id) => {
      const p = fake.state.rMHark.find((r) => r.id === id)!;
      p.deletedAt = new Date(NOW.getTime() - 1000);
      p.deletedBy = 'author';
      p.deletedByAdmin = true; // the mock then answers 409 already removed
    };
    await runSweep('sw1', NOW);
    expect(fake.state.moderationSweepItem).toHaveLength(0);
    expect(sweep().status).toBe('DONE');
  });
});

describe('a FAILED sweep with only pending rows', () => {
  it('counts them as removed and can be undone', async () => {
    seed({ posts: [post('p1', 10)], sweeps: [sweepRow({ postCount: 1 })] });
    failAfterRemoval();
    await runSweep('sw1', NOW);
    h.afterRemove = null;
    expect(sweep().status).toBe('FAILED');
    expect(fake.state.moderationSweepItem.every((i) => i.undone === 'pending' || i.undone === null)).toBe(true);
    expect(sweep().removedCount).toBe(1);

    const row = fake.state.moderationSweep[0]!;
    const view = toSweepView({
      ...row,
      subject: { id: 'spammer', name: 'Spam', handle: 'spam', username: null, banReason: null },
      admin: { id: 'admin', name: 'Ada', handle: 'ada', username: null },
    } as never);
    expect(view).toMatchObject({ removedCount: 1, canUndo: true });

    await undoSweep('admin', 'sw1', NOW);
    await runSweep('sw1', NOW);
    expect(sweep().status).toBe('UNDONE');
    expect(fake.state.rMHark[0]!.deletedAt).toBeNull();
    expect(sweep().restoredCount).toBe(1);
  });

  it('counts pending rows when the reclaim sweep stops a sweep that keeps dying', async () => {
    seed({
      posts: [post('p1', 10, removedByModerator())],
      sweeps: [
        sweepRow({
          reclaims: SWEEP_MAX_RECLAIMS,
          heartbeatAt: new Date(NOW.getTime() - SWEEP_LEASE_MS - 1000),
        }),
      ],
    });
    fake.state.moderationSweepItem.push({
      sweepId: 'sw1',
      entityType: 'rmhark',
      entityId: 'p1',
      removedAt: minutesAgo(4),
      undone: 'pending',
    });
    expect(await reclaimStalledSweeps(NOW)).toEqual([]);
    expect(sweep().status).toBe('FAILED');
    expect(sweep().removedCount).toBe(1);
    await undoSweep('admin', 'sw1', NOW);
    await runSweep('sw1', NOW);
    expect(sweep().status).toBe('UNDONE');
    expect(fake.state.rMHark[0]!.deletedAt).toBeNull();
  });

  it('settles a pending row whose content was never removed: nothing to undo, nothing restored', async () => {
    seed({
      posts: [post('p1', 10)],
      sweeps: [sweepRow({ status: 'FAILED', removedCount: 1, finishedAt: minutesAgo(1) })],
    });
    fake.state.moderationSweepItem.push({
      sweepId: 'sw1',
      entityType: 'rmhark',
      entityId: 'p1',
      removedAt: minutesAgo(4),
      undone: 'pending',
    });
    await undoSweep('admin', 'sw1', NOW);
    await runSweep('sw1', NOW);
    expect(sweep().status).toBe('UNDONE');
    expect(sweep().restoredCount).toBe(0);
    expect(fake.state.moderationSweepItem).toHaveLength(0);
  });

  it('a FAILED sweep with no item rows at all still refuses undo', async () => {
    seed({
      posts: [post('p1', 10)],
      sweeps: [sweepRow({ status: 'FAILED', removedCount: 0, finishedAt: minutesAgo(1) })],
    });
    let reason = 'none';
    try {
      await undoSweep('admin', 'sw1', NOW);
    } catch (error) {
      if (error instanceof SweepRefused) reason = error.reason;
    }
    expect(reason).toBe('not-undoable');
  });
});
