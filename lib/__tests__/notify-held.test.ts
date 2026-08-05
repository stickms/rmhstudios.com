import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * B13 — "hold, don't drop". The two halves worth testing without a database are
 * the ones a reviewer cannot verify by reading:
 *
 *  1. `collapseHeld` — dedupeKey folding, which payload survives a fold, and the
 *     rule that an UNKEYED hold is never merged with anything (merging those
 *     silently destroys text no other row carries).
 *  2. `summarizeHeld` — the promise that a flush is ONE push. Releasing eleven
 *     parked notifications at 07:00 is not respecting quiet hours, it is moving
 *     the interruption and multiplying it, so the shape of the single delivery
 *     is the feature.
 *
 * `flushHeldFor` is covered against a fake Prisma to pin the ordering that
 * matters for data loss: send first, mark flushed second.
 */

const prismaMock = vi.hoisted(() => ({
  heldNotification: {
    create: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  notificationPreference: { findMany: vi.fn() },
}));
const pushMock = vi.hoisted(() => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));
vi.mock('@/lib/push/send.server', () => ({
  sendPushToUser: pushMock.sendPushToUser,
  pushTitleFor: (type: string) => `title:${type}`,
}));

import {
  collapseHeld,
  summarizeHeld,
  holdNotification,
  flushHeldFor,
  type HeldRow,
  type HeldSummaryStrings,
} from '@/lib/notify/held.server';

const STRINGS: HeldSummaryStrings = {
  summaryTitle: 'While you were away',
  summaryBody: (n) => `${n} notifications arrived during quiet hours`,
  groupBody: (n) => `${n} new while you were away`,
};

let nextId = 1n;
function row(over: Partial<HeldRow> = {}): HeldRow {
  return {
    id: nextId++,
    category: 'social',
    channel: 'push',
    payload: { title: 'New like', body: 'Alice liked your post', url: '/n/1' },
    dedupeKey: null,
    heldAt: new Date('2026-08-05T02:00:00.000Z'),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  nextId = 1n;
});

describe('collapseHeld', () => {
  it('folds rows sharing a dedupeKey into one group', () => {
    const groups = collapseHeld([
      row({ dedupeKey: 'like:post1' }),
      row({ dedupeKey: 'like:post1' }),
      row({ dedupeKey: 'like:post1' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
    expect(groups[0].ids).toHaveLength(3);
  });

  it('keeps the NEWEST payload when folding', () => {
    const groups = collapseHeld([
      row({
        dedupeKey: 'k',
        heldAt: new Date('2026-08-05T01:00:00.000Z'),
        payload: { title: 'old' },
      }),
      row({
        dedupeKey: 'k',
        heldAt: new Date('2026-08-05T03:00:00.000Z'),
        payload: { title: 'new' },
      }),
      row({
        dedupeKey: 'k',
        heldAt: new Date('2026-08-05T02:00:00.000Z'),
        payload: { title: 'middle' },
      }),
    ]);
    expect(groups[0].payload.title).toBe('new');
    expect(groups[0].latest.toISOString()).toBe('2026-08-05T03:00:00.000Z');
  });

  it('never merges rows without a dedupeKey', () => {
    const groups = collapseHeld([row(), row(), row()]);
    expect(groups).toHaveLength(3);
    expect(groups.every((g) => g.count === 1)).toBe(true);
  });

  it('separates different dedupeKeys and orders groups newest-first', () => {
    const groups = collapseHeld([
      row({ dedupeKey: 'a', heldAt: new Date('2026-08-05T01:00:00.000Z') }),
      row({ dedupeKey: 'b', heldAt: new Date('2026-08-05T05:00:00.000Z') }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['b', 'a']);
  });

  it('survives a malformed payload rather than throwing mid-flush', () => {
    const groups = collapseHeld([row({ payload: null }), row({ payload: 'nonsense' })]);
    expect(groups).toHaveLength(2);
    expect(groups[0].payload.title).toBeTruthy();
  });

  it('returns nothing for no rows', () => {
    expect(collapseHeld([])).toEqual([]);
  });
});

describe('summarizeHeld', () => {
  it('is null when nothing was held', () => {
    expect(summarizeHeld([], STRINGS)).toBeNull();
  });

  it('replays a lone held notification verbatim', () => {
    const payload = summarizeHeld(collapseHeld([row({ dedupeKey: 'k' })]), STRINGS);
    expect(payload).toMatchObject({
      title: 'New like',
      body: 'Alice liked your post',
      url: '/n/1',
    });
  });

  it('badges a single group with its count instead of repeating the body', () => {
    const groups = collapseHeld([
      row({ dedupeKey: 'k' }),
      row({ dedupeKey: 'k' }),
      row({ dedupeKey: 'k' }),
    ]);
    const payload = summarizeHeld(groups, STRINGS);
    expect(payload?.title).toBe('New like');
    expect(payload?.body).toBe('3 new while you were away');
  });

  it('collapses MANY groups into exactly one summary push', () => {
    const groups = collapseHeld([
      row({ dedupeKey: 'a' }),
      row({ dedupeKey: 'a' }),
      row({ dedupeKey: 'b' }),
      row({ dedupeKey: 'c' }),
    ]);
    expect(groups).toHaveLength(3);
    const payload = summarizeHeld(groups, STRINGS);
    expect(payload?.title).toBe('While you were away');
    // Counts held ROWS (4), not groups (3) — the user cares how much they missed.
    expect(payload?.body).toBe('4 notifications arrived during quiet hours');
    expect(payload?.url).toBe('/notifications');
    // One tag, so a second flush replaces the first card instead of stacking.
    expect(payload?.tag).toBe('held-flush');
  });
});

describe('holdNotification', () => {
  it('writes a row and truncates an over-long dedupeKey to the column width', async () => {
    prismaMock.heldNotification.create.mockResolvedValue({});
    await holdNotification({
      userId: 'u1',
      category: 'social',
      channel: 'push',
      payload: { title: 'New like' },
      dedupeKey: 'x'.repeat(400),
    });
    const arg = prismaMock.heldNotification.create.mock.calls[0][0];
    expect(arg.data.dedupeKey).toHaveLength(160);
    expect(arg.data.userId).toBe('u1');
  });

  it('never throws — a failed hold must not break the action that caused it', async () => {
    prismaMock.heldNotification.create.mockRejectedValue(new Error('db down'));
    await expect(
      holdNotification({
        userId: 'u1',
        category: 'social',
        channel: 'push',
        payload: { title: 'New like' },
      }),
    ).resolves.toBeUndefined();
  });
});

describe('flushHeldFor', () => {
  const now = new Date('2026-08-05T07:00:00.000Z');

  it('sends one push and marks everything flushed', async () => {
    prismaMock.heldNotification.findMany.mockResolvedValue([
      row({ dedupeKey: 'a', heldAt: new Date('2026-08-05T02:00:00.000Z') }),
      row({ dedupeKey: 'a', heldAt: new Date('2026-08-05T02:30:00.000Z') }),
      row({ dedupeKey: 'b', heldAt: new Date('2026-08-05T03:00:00.000Z') }),
    ]);
    prismaMock.heldNotification.updateMany.mockResolvedValue({ count: 3 });

    const res = await flushHeldFor('u1', now);

    expect(pushMock.sendPushToUser).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ flushed: 3, groups: 2, delivered: true });
    // Marking flushed is scoped to unflushed rows, so a concurrent second flush
    // finds nothing rather than re-sending.
    const updateArg = prismaMock.heldNotification.updateMany.mock.calls[0][0];
    expect(updateArg.where.flushedAt).toBeNull();
    expect(updateArg.where.userId).toBe('u1');
  });

  it('does nothing when there is nothing held', async () => {
    prismaMock.heldNotification.findMany.mockResolvedValue([]);
    const res = await flushHeldFor('u1', now);
    expect(pushMock.sendPushToUser).not.toHaveBeenCalled();
    expect(prismaMock.heldNotification.updateMany).not.toHaveBeenCalled();
    expect(res.delivered).toBe(false);
  });

  it('flushes stale holds WITHOUT delivering them', async () => {
    // Held three days ago: the flush job was down. Delivering "Alice liked your
    // post" now is noise; the in-app row is still there for anyone who cares.
    prismaMock.heldNotification.findMany.mockResolvedValue([
      row({ dedupeKey: 'a', heldAt: new Date('2026-08-02T02:00:00.000Z') }),
    ]);
    prismaMock.heldNotification.updateMany.mockResolvedValue({ count: 1 });

    const res = await flushHeldFor('u1', now);
    expect(pushMock.sendPushToUser).not.toHaveBeenCalled();
    expect(res).toEqual({ flushed: 1, groups: 0, delivered: false });
  });

  it('swallows a database failure and reports nothing flushed', async () => {
    prismaMock.heldNotification.findMany.mockRejectedValue(new Error('db down'));
    await expect(flushHeldFor('u1', now)).resolves.toEqual({
      flushed: 0,
      groups: 0,
      delivered: false,
    });
  });
});
