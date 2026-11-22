import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, opRow } from './fake-bulk-db';

/** The two kinds that remove likes and reposts: predicates, preview = run, counters and notifications. */

const fake = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: new Proxy({}, { get: (_t, key) => (fake.current as Record<string | symbol, unknown>)[key] }),
}));
vi.mock('@/lib/trash/trash.server', () => ({
  softDeletePostAsAuthor: vi.fn(),
  softDeleteCommentAsAuthor: vi.fn(),
}));
vi.mock('@/lib/social/engagement.server', () => ({ unfollowUser: vi.fn() }));
const adjust = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/notifications.server', () => ({ adjustNotifUnread: adjust }));

import { createBulkOperation, previewBulk, runBulkOperation } from '@/lib/bulk/bulk.server';
import {
  BULK_KINDS,
  NOT_UNDOABLE_KINDS,
  buildWhere,
  droppedFilters,
  isBulkKind,
  normalizeFilter,
} from '@/lib/bulk/types';

const NOW = new Date('2026-11-27T12:00:00Z');
const DAY = 86_400_000;

describe('the predicates', () => {
  it('knows both kinds and marks them not undoable', () => {
    for (const kind of ['unlike-posts', 'delete-reposts']) {
      expect(isBulkKind(kind)).toBe(true);
      expect(BULK_KINDS).toContain(kind);
      expect(NOT_UNDOABLE_KINDS).toContain(kind);
    }
    expect(NOT_UNDOABLE_KINDS).not.toContain('delete-posts');
  });

  it('scopes both to the member and bounds them by the older of the two date filters', () => {
    for (const kind of ['unlike-posts', 'delete-reposts'] as const) {
      expect(buildWhere(kind, 'u1', {}, NOW)).toEqual({ userId: 'u1' });
      const where = buildWhere(kind, 'u1', { olderThanDays: 100, before: '2026-01-01T00:00:00.000Z' }, NOW);
      expect(where).toEqual({ userId: 'u1', createdAt: { lt: new Date('2026-01-01T00:00:00.000Z') } });
      const byDays = buildWhere(kind, 'u1', { olderThanDays: 365 }, NOW) as { createdAt: { lt: Date } };
      expect(byDays.createdAt.lt.getTime()).toBe(NOW.getTime() - 365 * DAY);
    }
  });

  it('drops filters a like or repost cannot honour rather than widening them', () => {
    const raw = { olderThanDays: 30, maxLikes: 0, onlyReplies: true, tag: 'x' };
    expect(normalizeFilter('unlike-posts', raw)).toEqual({ olderThanDays: 30 });
    expect(droppedFilters('delete-reposts', raw).sort()).toEqual(['maxLikes', 'onlyReplies', 'tag']);
  });
});

function seed(kind: 'unlike-posts' | 'delete-reposts') {
  const isLike = kind === 'unlike-posts';
  const old = new Date(NOW.getTime() - 400 * DAY);
  const recent = new Date(NOW.getTime() - 5 * DAY);
  const posts = ['a', 'b', 'c', 'd'].map((id) => ({ id: `p-${id}`, content: `post ${id}`, likeCount: 2, repostCount: 2 }));
  const rows = [
    { id: 'r1', rmheetId: 'p-a', userId: 'me', createdAt: old },
    { id: 'r2', rmheetId: 'p-b', userId: 'me', createdAt: old },
    { id: 'r3', rmheetId: 'p-c', userId: 'me', createdAt: recent }, // too new for the filter
    { id: 'r4', rmheetId: 'p-d', userId: 'other', createdAt: old }, // someone else's
  ];
  const notification = (id: string, post: string, extra: Record<string, unknown> = {}) => ({
    id,
    userId: 'author',
    actorId: 'me',
    type: isLike ? 'LIKE' : 'REPOST',
    entityType: 'rmhark',
    entityId: post,
    read: false,
    ...extra,
  });
  const fakeDb = createFakeDb({
    rMHark: posts,
    [isLike ? 'rMHarkLike' : 'rMHarkRepost']: rows,
    notification: [
      notification('n1', 'p-a'),
      notification('n2', 'p-b', { read: true }), // already read: the single path leaves it too
      notification('n3', 'p-c'),
      notification('n4', 'p-a', { type: isLike ? 'REPOST' : 'LIKE' }), // the other kind
      notification('n5', 'p-a', { actorId: 'someone' }),
    ],
    bulkOperation: [],
  });
  fake.current = fakeDb.db;
  return fakeDb;
}

describe.each(['unlike-posts', 'delete-reposts'] as const)('%s', (kind) => {
  const isLike = kind === 'unlike-posts';
  const counter = isLike ? 'likeCount' : 'repostCount';
  const other = isLike ? 'repostCount' : 'likeCount';
  let fakeDb: ReturnType<typeof seed>;
  beforeEach(() => {
    adjust.mockClear();
    fakeDb = seed(kind);
  });

  it('previews the same number the run then processes', async () => {
    const preview = await previewBulk('me', kind, { olderThanDays: 365 }, NOW);
    expect(preview.total).toBe(2);
    expect(preview.sample.map((s) => s.id).sort()).toEqual(['r1', 'r2']);
    expect(preview.sample[0]!.label).toMatch(/post/);

    const created = await createBulkOperation('me', kind, { olderThanDays: 365 }, NOW);
    expect(created.ok && created.operation.total).toBe(2);
    if (!created.ok) throw new Error('not created');
    await runBulkOperation(created.operation.id);
    const op = fakeDb.state.bulkOperation[0]!;
    expect(op.status).toBe('DONE');
    expect(op.processed).toBe(preview.total);
  });

  it('removes only the member’s matching rows and lowers exactly their posts’ counters', async () => {
    fakeDb.state.bulkOperation.push(opRow({ id: 'op9', userId: 'me', kind, filter: { olderThanDays: 365 }, total: 2, createdAt: NOW }));
    await runBulkOperation('op9', NOW);
    const table = fakeDb.state[isLike ? 'rMHarkLike' : 'rMHarkRepost'];
    expect(table.map((r) => r.id).sort()).toEqual(['r3', 'r4']);
    const by = Object.fromEntries(fakeDb.state.rMHark.map((p) => [p.id, p]));
    expect(by['p-a']![counter]).toBe(1);
    expect(by['p-b']![counter]).toBe(1);
    expect(by['p-c']![counter]).toBe(2);
    expect(by['p-d']![counter]).toBe(2);
    // The other counter is never touched.
    for (const p of fakeDb.state.rMHark) expect(p[other]).toBe(2);
  });

  it('retracts the unread notifications the member’s rows created, in one delete, and no others', async () => {
    fakeDb.state.bulkOperation.push(opRow({ id: 'op9', userId: 'me', kind, filter: { olderThanDays: 365 }, total: 2, createdAt: NOW }));
    await runBulkOperation('op9', NOW);
    expect(fakeDb.state.notification.map((n) => n.id).sort()).toEqual(['n2', 'n3', 'n4', 'n5']);
    const deletes = fakeDb.calls.filter((c) => c.table === 'notification' && c.method === 'deleteMany');
    expect(deletes).toHaveLength(1);
    expect(adjust).toHaveBeenCalledWith('author', -1);
  });

  it('runs a chunk and a half without losing a row or counting one twice', async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({
      id: `m${String(i).padStart(3, '0')}`,
      rmheetId: `q${i}`,
      userId: 'me',
      createdAt: new Date(NOW.getTime() - 500 * DAY),
    }));
    fakeDb.state[isLike ? 'rMHarkLike' : 'rMHarkRepost'] = many;
    fakeDb.state.rMHark = many.map((m) => ({ id: m.rmheetId, content: 'x', likeCount: 1, repostCount: 1 }));
    fakeDb.state.bulkOperation.push(opRow({ id: 'op9', userId: 'me', kind, filter: {}, total: 150, createdAt: NOW }));
    await runBulkOperation('op9', NOW);
    expect(fakeDb.state.bulkOperation[0]!.processed).toBe(150);
    expect(fakeDb.state.rMHark.every((p) => p[counter] === 0 && p[other] === 1)).toBe(true);
  });
});
