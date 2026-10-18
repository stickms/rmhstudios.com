/**
 * P01 feed-plus: the parts that guard private state or authority.
 *
 *  - X6 take meter: the agree/disagree split must not leave the server for a
 *    member who has not voted (and is not the author); a member cannot vote
 *    twice or on their own take.
 *  - X2 hidden replies: only the post's author may hide a reply.
 *  - X12 require alt text: the server refuses an undescribed image when the
 *    setting is on, and never looks the setting up for text-only posts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const db = vi.hoisted(() => ({
  rMHark: { findUnique: vi.fn(), update: vi.fn() },
  rMHarkTakeVote: { findUnique: vi.fn(), create: vi.fn() },
  rMHarkComment: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: db }));
vi.mock('@/lib/feed/audience.server', () => ({ canViewPost: vi.fn(async () => true) }));

import { Prisma } from '@prisma/client';
import { buildTakeState, takeSplit } from '@/lib/feed/take';
import { castTakeVote, getTakeState } from '@/lib/feed/take.server';
import { setReplyHidden } from '@/lib/feed/hidden-replies.server';
import { altTextViolation } from '@/lib/feed/alt-text.server';
import { missingAltIndexes } from '@/lib/feed/alt-text';
import { caughtUpBoundary, newestSeen } from '@/lib/feed/caught-up';
import type { FeedItem } from '@/lib/feed-types';

const take = {
  id: 'p1',
  userId: 'author',
  isTake: true,
  audience: 'PUBLIC',
  deletedAt: null,
  takeAgreeCount: 7,
  takeDisagreeCount: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.rMHark.findUnique.mockResolvedValue(take);
  db.rMHarkTakeVote.findUnique.mockResolvedValue(null);
  db.$transaction.mockResolvedValue([]);
});

describe('take meter (X6)', () => {
  it('hides the split from a viewer who has not voted', () => {
    expect(buildTakeState(take, 'reader', null).counts).toBeNull();
    expect(buildTakeState(take, null, null).counts).toBeNull();
  });

  it('shows the split to the author and to a voter', () => {
    expect(buildTakeState(take, 'author', null).counts).toEqual({ agree: 7, disagree: 3 });
    expect(buildTakeState(take, 'reader', 'agree').counts).toEqual({ agree: 7, disagree: 3 });
  });

  it('GET never includes counts for a non-voter', async () => {
    const state = await getTakeState('p1', 'reader');
    expect(state?.counts).toBeNull();
    expect(JSON.stringify(state)).not.toContain('7');
  });

  it('refuses to treat a non-take post as a take', async () => {
    db.rMHark.findUnique.mockResolvedValue({ ...take, isTake: false });
    expect(await getTakeState('p1', 'reader')).toBeNull();
    const res = await castTakeVote('p1', 'reader', 'agree');
    expect(res).toMatchObject({ ok: false, status: 404 });
  });

  it('does not let the author vote on their own take', async () => {
    const res = await castTakeVote('p1', 'author', 'agree');
    expect(res).toMatchObject({ ok: false, status: 403 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('records a vote and reveals the split', async () => {
    db.rMHarkTakeVote.findUnique.mockResolvedValue({ agree: true });
    const res = await castTakeVote('p1', 'reader', 'agree');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ ok: true, state: { myVote: 'agree', counts: { agree: 7 } } });
  });

  it('a repeat vote is a no-op that reports the standing vote', async () => {
    db.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );
    db.rMHarkTakeVote.findUnique.mockResolvedValue({ agree: false });
    const res = await castTakeVote('p1', 'reader', 'agree');
    expect(res).toMatchObject({ ok: true, state: { myVote: 'disagree' } });
  });

  it('rounds the split to whole percentages that sum to 100', () => {
    expect(takeSplit({ agree: 1, disagree: 2 })).toEqual({ agree: 33, disagree: 67, total: 3 });
    expect(takeSplit({ agree: 0, disagree: 0 })).toEqual({ agree: 0, disagree: 0, total: 0 });
  });
});

describe('hidden replies (X2)', () => {
  const comment = { rmheetId: 'p1', rmhark: { userId: 'author' } };

  it('lets only the post author hide a reply', async () => {
    db.rMHarkComment.findUnique.mockResolvedValue(comment);
    const stranger = await setReplyHidden('p1', 'c1', 'someone-else', true);
    expect(stranger).toMatchObject({ ok: false, status: 403 });
    expect(db.rMHarkComment.update).not.toHaveBeenCalled();

    const author = await setReplyHidden('p1', 'c1', 'author', true);
    expect(author).toEqual({ ok: true, hidden: true });
    expect(db.rMHarkComment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { hiddenAt: expect.any(Date) },
    });
  });

  it('unhide clears the marker', async () => {
    db.rMHarkComment.findUnique.mockResolvedValue(comment);
    await setReplyHidden('p1', 'c1', 'author', false);
    expect(db.rMHarkComment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { hiddenAt: null },
    });
  });

  it('rejects a reply that belongs to a different post', async () => {
    db.rMHarkComment.findUnique.mockResolvedValue({ ...comment, rmheetId: 'other' });
    expect(await setReplyHidden('p1', 'c1', 'author', true)).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});

describe('require alt text (X12)', () => {
  it('finds images without a description', () => {
    expect(
      missingAltIndexes(['a', 'b', 'c'], ['one', ' ', undefined as unknown as string]),
    ).toEqual([1, 2]);
    expect(missingAltIndexes([], [])).toEqual([]);
  });

  it('blocks an undescribed image only when the setting is on', async () => {
    db.user.findUnique.mockResolvedValue({ requireAltText: true });
    expect(await altTextViolation('u', ['a'], [''])).toMatch(/description/i);
    expect(await altTextViolation('u', ['a'], ['a dog'])).toBeNull();

    db.user.findUnique.mockResolvedValue({ requireAltText: false });
    expect(await altTextViolation('u', ['a'], [])).toBeNull();
  });

  it('does not look the setting up for a post without images', async () => {
    expect(await altTextViolation('u', undefined, undefined)).toBeNull();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('caught-up divider (X7)', () => {
  const post = (id: string, createdAt: string, extra: Partial<FeedItem> = {}): FeedItem => ({
    id,
    type: 'rmhark',
    createdAt,
    ...extra,
  });
  const items = [
    post('n2', '2026-10-12T10:00:00Z'),
    post('n1', '2026-10-12T09:00:00Z'),
    post('o1', '2026-10-11T09:00:00Z'),
    post('o2', '2026-10-11T08:00:00Z'),
  ];

  it('draws the divider before the first post from the last session', () => {
    expect(caughtUpBoundary(items, '2026-10-11T12:00:00Z')).toBe('o1');
  });

  it('draws nothing without a previous session, or when nothing is new', () => {
    expect(caughtUpBoundary(items, null)).toBeNull();
    expect(caughtUpBoundary(items, '2026-10-12T10:00:00Z')).toBeNull();
    expect(caughtUpBoundary(items.slice(2), '2026-10-12T00:00:00Z')).toBeNull();
  });

  it('ignores optimistic posts when picking the newest seen', () => {
    const withTemp = [post('temp-1', '2026-10-13T00:00:00Z', { pending: true }), ...items];
    expect(newestSeen(withTemp)).toBe('2026-10-12T10:00:00Z');
  });
});
