import { describe, expect, it, vi } from 'vitest';
import { createFakeDb, opRow } from './fake-bulk-db';

/**
 * Clearing bookmarks in bulk (s09-10): every removed post bookmark leaves one `bookmark` tombstone, written in the
 * chunk's transaction, so a sync client learns of the deletions. Other members' bookmarks and non-post saves are
 * neither deleted nor tombstoned.
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
vi.mock('@/lib/jobs/boss.server', () => ({ getBoss: vi.fn(async () => null) }));

import { runBulkOperation } from '@/lib/bulk/bulk.server';

describe('bulk clear-bookmarks', () => {
  it('writes one bookmark tombstone per removed post and nothing for what it left', async () => {
    const at = new Date('2020-01-01');
    const db = createFakeDb({
      bulkOperation: [opRow({ kind: 'clear-bookmarks', total: 3 })],
      savedItem: [
        { id: 's1', userId: 'u1', entityType: 'rmhark', entityId: 'post-a', createdAt: at },
        { id: 's2', userId: 'u1', entityType: 'rmhark', entityId: 'post-b', createdAt: at },
        { id: 's3', userId: 'u1', entityType: 'book', entityId: 'a-book', createdAt: at },
        { id: 's4', userId: 'u2', entityType: 'rmhark', entityId: 'post-c', createdAt: at },
      ],
    });
    fake.current = db.db;
    await runBulkOperation('op1');
    expect(db.state.bulkOperation[0]!.status).toBe('DONE');
    expect(db.state.savedItem.map((r) => r.id).sort()).toEqual(['s3', 's4']);
    expect(db.state.syncTombstone.map((r) => [r.userId, r.kind, r.entityId]).sort()).toEqual([
      ['u1', 'bookmark', 'post-a'],
      ['u1', 'bookmark', 'post-b'],
    ]);
  });
});
