import { describe, it, expect } from 'vitest';
import {
  groupNotifications,
  targetIdOf,
  unreadCountOf,
  DEFAULT_BUCKET_MS,
  type GroupableNotification,
} from '@/lib/notifications/group';

/**
 * B6 grouping is a *read-time* transform, so it is exactly the kind of code that
 * looks obviously right and is off by one hour. The cases below are the ones
 * that decide whether the list is trustworthy: bucket boundaries (a like at
 * 10:59:59 and one at 11:00:01 are NOT the same pile), target isolation (two
 * posts never merge just because they were liked in the same minute), and unread
 * propagation (a group containing one unread row must render as unread, or the
 * badge and the list disagree).
 */

const HOUR = DEFAULT_BUCKET_MS;
const base = new Date('2026-08-05T10:00:00.000Z').getTime();

function like(
  id: string,
  offsetMs: number,
  entityId = 'post1',
  read = true,
): GroupableNotification {
  return {
    id,
    type: 'LIKE',
    entityType: 'rmhark',
    entityId,
    createdAt: new Date(base + offsetMs).toISOString(),
    read,
  };
}

describe('targetIdOf', () => {
  it('composes entityType:entityId, and is null without a target', () => {
    expect(targetIdOf(like('a', 0))).toBe('rmhark:post1');
    expect(targetIdOf({ id: 'f', type: 'FOLLOW', createdAt: new Date(base) })).toBeNull();
  });
});

describe('groupNotifications', () => {
  it('collapses same type + target + hour into one group with a count', () => {
    const groups = groupNotifications([like('a', 0), like('b', 60_000), like('c', 120_000)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
    expect(groups[0].type).toBe('LIKE');
    expect(groups[0].targetId).toBe('rmhark:post1');
  });

  it('reports the LATEST timestamp for the group, not the first seen', () => {
    // Fed oldest-first on purpose: a naive implementation keeps whichever row it
    // saw first and timestamps the group hours in the past.
    const groups = groupNotifications([like('a', 0), like('b', 30 * 60_000)]);
    expect(groups[0].latest.toISOString()).toBe(new Date(base + 30 * 60_000).toISOString());
    // Items inside the group come back newest-first regardless of input order.
    expect(groups[0].items.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('splits across an hour boundary even when the rows are seconds apart', () => {
    // base is exactly on the hour, so these straddle a bucket edge by 2 seconds.
    const justBefore = like('a', HOUR - 1_000);
    const justAfter = like('b', HOUR + 1_000);
    const groups = groupNotifications([justBefore, justAfter]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.count === 1)).toBe(true);
  });

  it('never merges different targets or different types', () => {
    const groups = groupNotifications([
      like('a', 0, 'post1'),
      like('b', 1_000, 'post2'),
      { ...like('c', 2_000, 'post1'), type: 'REPOST' },
    ]);
    expect(groups).toHaveLength(3);
  });

  it('groups targetless rows (follows) by type + hour', () => {
    const follow = (id: string, offset: number): GroupableNotification => ({
      id,
      type: 'FOLLOW',
      createdAt: new Date(base + offset),
      read: true,
    });
    const groups = groupNotifications([follow('a', 0), follow('b', 1_000)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].targetId).toBeNull();
  });

  it('opts a type out of grouping entirely', () => {
    const rows = [like('a', 0), like('b', 1_000)];
    expect(groupNotifications(rows, { neverGroup: ['LIKE'] })).toHaveLength(2);
  });

  it('marks a group unread when ANY row in it is unread', () => {
    const groups = groupNotifications([
      like('a', 0, 'post1', true),
      like('b', 1_000, 'post1', false),
      like('c', 2_000, 'post1', true),
    ]);
    expect(groups[0].unread).toBe(true);
    expect(unreadCountOf(groups[0])).toBe(1);
  });

  it('orders groups newest-first', () => {
    const groups = groupNotifications([
      like('old', 0, 'post1'),
      like('new', 3 * HOUR, 'post2'),
      like('mid', HOUR + 60_000, 'post3'),
    ]);
    expect(groups.map((g) => g.items[0].id)).toEqual(['new', 'mid', 'old']);
  });

  it('is stable for an empty list and for an unparseable timestamp', () => {
    expect(groupNotifications([])).toEqual([]);
    const groups = groupNotifications([{ id: 'x', type: 'LIKE', createdAt: 'not-a-date' }]);
    // Kept, not dropped: a row that counts toward the badge must be visible.
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(1);
  });

  it('accepts Date and ISO string timestamps interchangeably', () => {
    const groups = groupNotifications([
      { id: 'a', type: 'LIKE', entityId: 'p', createdAt: new Date(base) },
      { id: 'b', type: 'LIKE', entityId: 'p', createdAt: new Date(base + 1_000).toISOString() },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
  });

  it('honours a custom bucket width', () => {
    const rows = [like('a', 0), like('b', 90 * 60_000)];
    expect(groupNotifications(rows, { bucketMs: 24 * HOUR })).toHaveLength(1);
    expect(groupNotifications(rows)).toHaveLength(2);
  });
});
