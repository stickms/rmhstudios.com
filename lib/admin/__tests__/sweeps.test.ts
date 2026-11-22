import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSweepDb } from './sweeps-fake-db';

/**
 * Spam sweeps (sprint 08 18): preview changes nothing; confirm is capped, locked and rate limited; a run removes
 * only undeleted items in the window and ends with one notice and one audit row; undo restores only what is still
 * in the state this sweep left it, voids the strike and tells the member once; a lost lease stops a run; the
 * reclaim sweep re-queues a stalled one. Prisma is an in-memory fake; `moderateContent` is replaced by one that
 * writes the same fields the real one does.
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
  SWEEP_LEASE_MS,
  SWEEP_MAX_RECLAIMS,
  SWEEP_STALLED_AFTER_MS,
  SweepRefused,
  confirmSweep,
  createSweepPreview,
  reclaimStalledSweeps,
  runSweep,
  undoSweep,
} from '@/lib/admin/sweeps.server';
import { SWEEP_CONFIRMS_PER_HOUR, SWEEP_MAX_ITEMS, SWEEP_BATCH_SIZE } from '@/lib/admin/sweeps';
import { SWEEP_QUEUE, enqueueSweepRun } from '@/lib/admin/sweeps-jobs.server';

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
  boss.current = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  seed();
});

describe('preview', () => {
  it('counts the window, shows the account, and changes nothing', async () => {
    seed({
      posts: [
        post('p1', 10),
        post('p2', 20, { likeCount: 2 }),
        post('old', 60 * 24 * 3),
        post('gone', 30, { deletedAt: minutesAgo(5), deletedBy: 'author' }),
      ],
      replies: [{ ...post('c1', 15), rmheetId: 'x' }],
    });
    const { sweep: view, preview } = await createSweepPreview('admin', body(), NOW);
    expect(preview).toMatchObject({ posts: 2, replies: 1, total: 3, overLimit: false });
    expect(preview.sample.map((s) => s.id)).toEqual(['p1', 'c1', 'p2']);
    expect(preview.account).toMatchObject({ ageDays: 3, old: false, activeStrikes: 1 });
    expect(view.status).toBe('PREVIEW');
    // Nothing was removed, nothing was sent, nothing was audited.
    expect(h.moderate).toHaveLength(0);
    expect(h.notices).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
    expect(fake.state.rMHark.filter((p) => p.deletedAt === null && p.userId === 'spammer')).toHaveLength(3);
  });

  it('refuses an admin subject (including the acting admin), a deleted account and a bad window', async () => {
    expect(await refusal(createSweepPreview('admin', body({ subjectId: 'admin2' }), NOW))).toBe('subject-admin');
    expect(await refusal(createSweepPreview('admin', body({ subjectId: 'admin' }), NOW))).toBe('subject-admin');
    expect(await refusal(createSweepPreview('admin', body({ subjectId: 'nobody' }), NOW))).toBe('subject-not-found');
    fake.state.user.find((u) => u.id === 'spammer')!.banReason = 'account_deleted';
    expect(await refusal(createSweepPreview('admin', body(), NOW))).toBe('subject-deleted');
    fake.state.user.find((u) => u.id === 'spammer')!.banReason = null;
    const from = minutesAgo(60 * 24 * 31).toISOString();
    expect(await refusal(createSweepPreview('admin', body({ from, to: NOW.toISOString() }), NOW))).toBe(
      'window-too-long',
    );
  });

  it('says so when the account is older than 90 days', async () => {
    fake.state.user.find((u) => u.id === 'spammer')!.createdAt = minutesAgo(60 * 24 * 800);
    const { preview } = await createSweepPreview('admin', body(), NOW);
    expect(preview.account).toMatchObject({ ageDays: 800, old: true });
  });
});

describe('confirm', () => {
  async function previewed(posts: Row[]) {
    seed({ posts });
    const { sweep: s } = await createSweepPreview('admin', body(), NOW);
    return s.id;
  }

  it('starts the run under the member lock', async () => {
    const id = await previewed([post('p1', 10)]);
    const view = await confirmSweep('admin', id);
    expect(view.status).toBe('RUNNING');
    expect(view.postCount).toBe(1);
    expect(h.locks).toEqual(['sweeps:confirm-cap', 'sweep:spammer']);
  });

  it('is capped at 5,000 items: the window is recounted and a bigger one is refused', async () => {
    const posts = Array.from({ length: SWEEP_MAX_ITEMS + 1 }, (_, i) => post(`p${i}`, 10));
    const id = await previewed(posts);
    expect(await refusal(confirmSweep('admin', id))).toBe('over-limit');
    expect(fake.state.moderationSweep[0]!.status).toBe('PREVIEW');
  });

  it('allows one running sweep per member', async () => {
    const id = await previewed([post('p1', 10)]);
    fake.state.moderationSweep.push(sweepRow({ id: 'other', adminId: 'admin2', confirmedAt: null }));
    expect(await refusal(confirmSweep('admin', id))).toBe('already-running');
  });

  it('refuses the eleventh confirm in an hour', async () => {
    const id = await previewed([post('p1', 10)]);
    for (let i = 0; i < SWEEP_CONFIRMS_PER_HOUR; i += 1) {
      fake.state.moderationSweep.push(
        sweepRow({ id: `old${i}`, status: 'DONE', confirmedAt: new Date(Date.now() - 60_000) }),
      );
    }
    expect(await refusal(confirmSweep('admin', id))).toBe('confirm-limit');
    // The tenth was still allowed.
    fake.state.moderationSweep.pop();
    expect(await confirmSweep('admin', id).then((v) => v.status)).toBe('RUNNING');
  });

  it("refuses a stale preview, a second confirm, another admin's preview and a subject who became an admin", async () => {
    const id = await previewed([post('p1', 10)]);
    expect(await refusal(confirmSweep('admin2', id))).toBe('not-found');
    fake.state.user.find((u) => u.id === 'spammer')!.isAdmin = true;
    expect(await refusal(confirmSweep('admin', id))).toBe('subject-admin');
    fake.state.user.find((u) => u.id === 'spammer')!.isAdmin = false;
    await confirmSweep('admin', id);
    expect(await refusal(confirmSweep('admin', id))).toBe('not-a-preview');
    const id2 = await previewed([post('p1', 10)]);
    expect(await refusal(confirmSweep('admin', id2).then(() => confirmSweep('admin', id2)))).toBe('not-a-preview');
    const stale = await previewed([post('p1', 10)]);
    fake.state.moderationSweep[0]!.createdAt = new Date(NOW.getTime() - 2 * 3_600_000);
    expect(await refusal(confirmSweep('admin', stale))).toBe('preview-expired');
  });

  it('refuses an empty window', async () => {
    const id = await previewed([]);
    expect(await refusal(confirmSweep('admin', id))).toBe('nothing-to-remove');
  });
});

describe('the run', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => post(`p${String(i).padStart(3, '0')}`, 600 - i));

  it('removes only undeleted items in the window, with one notice, one audit row and one feed event per batch', async () => {
    seed({
      posts: [
        ...many(250),
        post('before', 60 * 30),
        post('author', 30, { deletedAt: minutesAgo(10), deletedBy: 'author' }),
        post('else', 30, { userId: 'someone' }),
      ],
      replies: [{ ...post('c1', 20), rmheetId: 'x' }],
      sweeps: [sweepRow({ postCount: 250, replyCount: 1 })],
    });
    await runSweep('sw1', NOW);

    const s = sweep();
    expect(s.status).toBe('DONE');
    expect(s.removedCount).toBe(251);
    expect(h.moderate.every((m) => (m.sweep as { id: string }).id === 'sw1' && m.action === 'remove')).toBe(true);
    // The window's posts and the reply: not the older post, the author's own deletion or someone else's post.
    expect(fake.state.rMHark.filter((p) => p.deletedBy === 'moderator')).toHaveLength(250);
    expect(fake.state.rMHark.find((p) => p.id === 'before')!.deletedAt).toBeNull();
    expect(fake.state.rMHark.find((p) => p.id === 'author')!.deletedBy).toBe('author');
    expect(fake.state.rMHark.find((p) => p.id === 'else')!.deletedAt).toBeNull();
    // Each item records the exact deletedAt the removal wrote.
    const item = fake.state.moderationSweepItem.find((i) => i.entityId === 'p000')!;
    expect(item.removedAt).toEqual(fake.state.rMHark.find((p) => p.id === 'p000')!.deletedAt);
    expect(fake.state.moderationSweepItem.find((i) => i.entityId === 'author')).toBeUndefined();
    // One notice, one audit row.
    expect(h.notices).toHaveLength(1);
    expect(h.notices[0]).toMatchObject({
      userId: 'spammer',
      type: 'SYSTEM',
      entityType: 'moderation-sweep',
      entityId: 'sw1',
    });
    expect(String(h.notices[0]!.preview)).toContain('251');
    expect(h.audits.filter((a) => a.action === 'sweep.remove')).toHaveLength(1);
    // Batches of 100: three batches of posts (250 = 100 + 100 + 50), then the reply batch; one event per removed post (on its own channel), none for replies.
    expect(h.feedEvents).toHaveLength(250);
    expect(h.strikes).toHaveLength(0);
  });

  it('issues the strike once, linked to the sweep, and says so in the notice', async () => {
    seed({ posts: [post('p1', 10)], sweeps: [sweepRow({ withStrike: true, postCount: 1 })] });
    await runSweep('sw1', NOW);
    expect(h.strikes).toEqual([
      expect.objectContaining({ userId: 'spammer', entityType: 'moderation-sweep', entityId: 'sw1', notify: false }),
    ]);
    expect(sweep().strikeId).toBe('strike-1');
    expect(String(h.notices[0]!.preview)).toContain('strike');
  });

  it('a second sweep inside the hour folds into the first notice while it is unread', async () => {
    seed({ posts: [post('p1', 10), post('p2', 11)], sweeps: [sweepRow({ postCount: 2 })] });
    fake.state.notification.push({
      id: 'n1',
      userId: 'spammer',
      type: 'SYSTEM',
      entityType: 'moderation-sweep',
      entityId: 'sw0',
      read: false,
      createdAt: new Date(),
      preview: '5 posts and replies were removed by site moderation. Reason: x.',
    });
    await runSweep('sw1', NOW);
    expect(h.notices).toHaveLength(0);
    expect(String(fake.state.notification[0]!.preview)).toMatch(/^7 posts and replies/);
    expect(fake.state.notification[0]!.entityId).toBe('sw1');
  });

  it('a read first notice does not absorb the second', async () => {
    seed({ posts: [post('p1', 10)], sweeps: [sweepRow({ postCount: 1 })] });
    fake.state.notification.push({
      id: 'n1',
      userId: 'spammer',
      type: 'SYSTEM',
      entityType: 'moderation-sweep',
      read: true,
      createdAt: new Date(),
      preview: '5 posts',
    });
    await runSweep('sw1', NOW);
    expect(h.notices).toHaveLength(1);
  });

  it('stops when the lease is lost: no completion, no audit row, no notice', async () => {
    seed({ posts: many(250), sweeps: [sweepRow({ postCount: 250 })] });
    h.afterRemove = (n) => {
      // Another runner takes the lease while the first batch is being worked.
      if (n === 10) sweep().heartbeatAt = new Date(Date.now() + 5_000);
    };
    await runSweep('sw1', NOW);
    expect(sweep().status).toBe('RUNNING');
    expect(h.audits).toHaveLength(0);
    expect(h.notices).toHaveLength(0);
    // It stopped at the end of the batch it was in (100 items), not after 250.
    expect(h.moderate.length).toBe(SWEEP_BATCH_SIZE);
  });

  it("refuses to run while another runner's lease is live, and when it is not RUNNING", async () => {
    seed({ posts: many(5), sweeps: [sweepRow({ heartbeatAt: new Date(Date.now() - 10_000) })] });
    await runSweep('sw1', NOW);
    expect(h.moderate).toHaveLength(0);
    sweep().heartbeatAt = null;
    sweep().status = 'DONE';
    await runSweep('sw1', NOW);
    expect(h.moderate).toHaveLength(0);
  });

  it('resumes after a restart without double counts: the cursor and the predicate skip finished work', async () => {
    seed({ posts: many(250), sweeps: [sweepRow({ postCount: 250 })] });
    h.afterRemove = (n) => {
      if (n === 150) sweep().heartbeatAt = new Date(Date.now() + 5_000); // lost during batch two
    };
    await runSweep('sw1', NOW);
    expect(sweep().status).toBe('RUNNING');
    expect(sweep().cursorId).toBe('p099');
    // The worker restarts; the lease it held expires.
    h.afterRemove = null;
    sweep().heartbeatAt = new Date(Date.now() - SWEEP_LEASE_MS - 5_000);
    const before = h.moderate.length;
    await runSweep('sw1', NOW);
    expect(sweep().status).toBe('DONE');
    expect(sweep().removedCount).toBe(250);
    expect(fake.state.moderationSweepItem).toHaveLength(250);
    // Batch two finished its removals before the lease check failed; the resumed run does only what is left.
    expect(h.moderate.length - before).toBe(50);
    expect(new Set(h.moderate.map((m) => m.entityId)).size).toBe(h.moderate.length);
    expect(h.audits.filter((a) => a.action === 'sweep.remove')).toHaveLength(1);
    expect(h.notices).toHaveLength(1);
  });

  it('marks the sweep FAILED with an audit row when something unexpected throws', async () => {
    seed({ posts: many(3), sweeps: [sweepRow({ postCount: 3 })] });
    h.afterRemove = () => {
      throw new Error('database went away');
    };
    await runSweep('sw1', NOW);
    expect(sweep().status).toBe('FAILED');
    expect(sweep().error).toBe('database went away');
    expect(h.audits.map((a) => a.action)).toEqual(['sweep.failed']);
  });
});

describe('undo', () => {
  /** A finished sweep of three posts and a reply, as the run leaves it. */
  async function finished(over: Row = {}) {
    seed({
      posts: [post('p1', 10), post('p2', 11), post('p3', 12)],
      replies: [{ ...post('c1', 13), rmheetId: 'x' }],
      sweeps: [sweepRow({ postCount: 3, replyCount: 1, withStrike: true, ...over })],
    });
    await runSweep('sw1', NOW);
    h.moderate.length = 0;
    h.audits.length = 0;
    h.notices.length = 0;
  }
  const runUndo = async () => {
    await undoSweep('admin2', 'sw1');
    await runSweep('sw1', NOW);
  };

  it('restores the swept items, withdraws the strike, sends one notice and one audit row', async () => {
    await finished();
    expect(sweep().status).toBe('DONE');
    await runUndo();
    expect(fake.state.rMHark.every((p) => p.deletedAt === null)).toBe(true);
    expect(fake.state.rMHarkComment[0]!.deletedAt).toBeNull();
    expect(sweep()).toMatchObject({ status: 'UNDONE', restoredCount: 4 });
    expect(h.moderate.every((m) => m.action === 'restore' && m.adminId === 'admin2')).toBe(true);
    expect(h.overturned).toEqual([expect.objectContaining({ strikeId: 'strike-1', adminId: 'admin2' })]);
    expect(h.notices).toEqual([
      expect.objectContaining({
        entityType: 'moderation-sweep-undone',
        userId: 'spammer',
        preview: expect.objectContaining({ fallback: '4 posts and replies were restored by site moderation.' }),
      }),
    ]);
    expect(h.audits.filter((a) => a.action === 'sweep.undo')).toHaveLength(1);
  });

  it('skips an item a later moderator removed again (a different deletedAt) and one the author deleted since', async () => {
    await finished();
    // A moderator restored p2 and removed it again later: a new deletedAt.
    fake.state.rMHark.find((p) => p.id === 'p2')!.deletedAt = new Date(Date.now() + 60_000);
    // The author restored p3 from the bin and deleted it: deletedBy is no longer the moderator.
    fake.state.rMHark.find((p) => p.id === 'p3')!.deletedBy = 'author';
    await runUndo();
    expect(fake.state.rMHark.find((p) => p.id === 'p1')!.deletedAt).toBeNull();
    expect(fake.state.rMHark.find((p) => p.id === 'p2')!.deletedAt).not.toBeNull();
    expect(fake.state.rMHark.find((p) => p.id === 'p3')!.deletedAt).not.toBeNull();
    expect(
      h.moderate
        .filter((m) => m.action === 'restore')
        .map((m) => m.entityId)
        .sort(),
    ).toEqual(['c1', 'p1']);
    expect(sweep().restoredCount).toBe(2);
    expect(fake.state.moderationSweepItem.filter((i) => i.undone === 'skipped')).toHaveLength(2);
  });

  it('never restores an item the member deleted themselves before the sweep', async () => {
    seed({
      posts: [post('p1', 10), post('mine', 11, { deletedAt: minutesAgo(3), deletedBy: 'author' })],
      sweeps: [sweepRow({ postCount: 1 })],
    });
    await runSweep('sw1', NOW);
    await runUndo();
    expect(fake.state.rMHark.find((p) => p.id === 'mine')!.deletedBy).toBe('author');
    expect(fake.state.rMHark.find((p) => p.id === 'mine')!.deletedAt).not.toBeNull();
  });

  it("is refused once the member's account is deleted, and when the sweep is not done", async () => {
    await finished();
    fake.state.user.find((u) => u.id === 'spammer')!.banReason = 'account_deleted';
    expect(await refusal(undoSweep('admin2', 'sw1'))).toBe('subject-deleted');
    fake.state.user.find((u) => u.id === 'spammer')!.banReason = null;
    sweep().status = 'PREVIEW';
    expect(await refusal(undoSweep('admin2', 'sw1'))).toBe('not-undoable');
    sweep().status = 'DONE';
    await undoSweep('admin2', 'sw1');
    expect(await refusal(undoSweep('admin2', 'sw1'))).toBe('not-undoable'); // already running its undo
  });

  it('does not touch a strike when none was given, and does not run twice', async () => {
    await finished({ withStrike: false });
    await runUndo();
    expect(h.overturned).toHaveLength(0);
    await runSweep('sw1', NOW);
    expect(h.notices).toHaveLength(1);
  });
});

describe('reclaim', () => {
  it('re-queues a sweep whose lease expired, counts it, and leaves a live one alone', async () => {
    seed({
      sweeps: [
        sweepRow({ id: 'stale', subjectId: 'spammer', heartbeatAt: new Date(NOW.getTime() - SWEEP_LEASE_MS - 1000) }),
        sweepRow({ id: 'live', heartbeatAt: new Date(NOW.getTime() - 5_000) }),
        sweepRow({ id: 'fresh', heartbeatAt: null, queuedAt: new Date(NOW.getTime() - 60_000) }),
        sweepRow({ id: 'never', heartbeatAt: null, queuedAt: new Date(NOW.getTime() - SWEEP_STALLED_AFTER_MS - 1000) }),
        sweepRow({ id: 'done', status: 'DONE', heartbeatAt: new Date(NOW.getTime() - 3_600_000) }),
      ],
    });
    const ids = await reclaimStalledSweeps(NOW);
    expect(ids.sort()).toEqual(['never', 'stale']);
    expect(sweep('stale').reclaims).toBe(1);
    expect(sweep('live').reclaims).toBe(0);
  });

  it('stops one that keeps dying as FAILED', async () => {
    seed({
      sweeps: [
        sweepRow({
          id: 'dying',
          reclaims: SWEEP_MAX_RECLAIMS,
          heartbeatAt: new Date(NOW.getTime() - SWEEP_LEASE_MS - 1000),
        }),
      ],
    });
    expect(await reclaimStalledSweeps(NOW)).toEqual([]);
    expect(sweep('dying').status).toBe('FAILED');
  });

  it('the queue sends one job per sweep, and falls back to an inline run without a queue', async () => {
    const send = vi.fn(async () => 'job');
    expect(await enqueueSweepRun('sw1', { send } as never)).toBe('queued');
    expect(send).toHaveBeenCalledWith(
      SWEEP_QUEUE,
      { sweepId: 'sw1' },
      expect.objectContaining({ singletonKey: 'sweep-run:sw1' }),
    );
    seed({ posts: [post('p1', 10)], sweeps: [sweepRow({ postCount: 1 })] });
    expect(await enqueueSweepRun('sw1', null)).toBe('inline');
  });
});

describe('the routes', () => {
  const read = (f: string) => readFileSync(new URL(`../api/${f}`, import.meta.url), 'utf8');
  it('are admin only, and confirm is limited to ten an hour', () => {
    for (const f of ['admin.sweeps.server.ts', 'admin.sweeps.$id.server.ts', 'admin.sweeps.$id.undo.server.ts']) {
      expect(read(f)).toContain("auth: 'admin'");
    }
    expect(read('admin.sweeps.$id.server.ts')).toContain("prefix: 'admin-sweep'");
    expect(read('admin.sweeps.$id.server.ts')).toContain('SWEEP_CONFIRMS_PER_HOUR');
    expect(SWEEP_CONFIRMS_PER_HOUR).toBe(10);
  });
});
