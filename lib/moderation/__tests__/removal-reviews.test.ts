import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemovalRow } from './removal-fake-db';

/**
 * Sprint 15, feature 16: the second look. Ask once, within 14 days, for a removal that can be undone; an admin decides
 * once; a restore clears the stamp and publishes nothing. Fakes are checked against the schema (`shapeChecked`).
 */

const h = vi.hoisted(() => ({
  sent: [] as Record<string, unknown>[],
  removals: null as null | ReturnType<typeof import('./removal-fake-db').makeRemovalDb>,
  deckUpdate: vi.fn(async () => ({ count: 1 })),
  audit: vi.fn(async () => ({})),
}));

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  const { makeRemovalDb } = await import('./removal-fake-db');
  h.removals = makeRemovalDb();
  const prisma: Record<string, unknown> = {
    contentRemoval: h.removals.contentRemoval,
    flashcardDeck: {
      updateMany: h.deckUpdate,
      findMany: vi.fn(async () => [{ id: 'deck-1', title: 'My <deck>' }]),
    },
    adminAuditLog: { create: h.audit },
  };
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma: shapeChecked(prisma) };
});
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (input: Record<string, unknown>) => {
    h.sent.push(input);
  }),
}));

import { assertJsonSafe } from '@/lib/db/query-shape';
import {
  decideRemovalReview,
  listAdminRemovalReviews,
  listMyRemovals,
  requestRemovalReview,
} from '@/lib/moderation/removal-reviews.server';

const NOW = new Date('2027-01-20T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function removal(over: Partial<RemovalRow> = {}): RemovalRow {
  return {
    id: 'rem-1',
    reportId: 'report-secret-1',
    entityType: 'study-deck',
    entityId: 'deck-1',
    authorId: 'author',
    removedAt: new Date(NOW.getTime() - 2 * DAY),
    reversible: true,
    reviewRequestedAt: null,
    reviewNote: null,
    reviewDecidedAt: null,
    reviewOutcome: null,
    reviewedById: null,
    ...over,
  };
}
const previewOf = (n: Record<string, unknown>) => n.preview as { key: string; params: Record<string, unknown> };

beforeEach(() => {
  h.sent = [];
  h.removals!.rows.length = 0;
  h.deckUpdate.mockClear();
  h.audit.mockClear();
});

describe('asking for a second look', () => {
  it('asks once, with a trimmed note', async () => {
    h.removals!.rows.push(removal());
    expect(await requestRemovalReview('author', 'rem-1', '  It was my own deck.  ', NOW)).toBe('asked');
    expect(h.removals!.rows[0]).toMatchObject({ reviewRequestedAt: NOW, reviewNote: 'It was my own deck.' });
    expect(await requestRemovalReview('author', 'rem-1', undefined, NOW)).toBe('already_asked');
  });

  it('two taps at once ask once', async () => {
    h.removals!.rows.push(removal());
    const results = await Promise.all([
      requestRemovalReview('author', 'rem-1', undefined, NOW),
      requestRemovalReview('author', 'rem-1', undefined, NOW),
    ]);
    expect([...results].sort()).toEqual(['already_asked', 'asked']);
  });

  it('refuses a removal that cannot be undone', async () => {
    h.removals!.rows.push(removal({ entityType: 'comment', reversible: false }));
    expect(await requestRemovalReview('author', 'rem-1', undefined, NOW)).toBe('closed');
    expect(h.removals!.rows[0]!.reviewRequestedAt).toBeNull();
  });

  it('refuses after 14 days, and accepts on the last day', async () => {
    h.removals!.rows.push(removal({ removedAt: new Date(NOW.getTime() - 15 * DAY) }));
    expect(await requestRemovalReview('author', 'rem-1', undefined, NOW)).toBe('closed');
    h.removals!.rows[0]!.removedAt = new Date(NOW.getTime() - 14 * DAY + 1000);
    expect(await requestRemovalReview('author', 'rem-1', undefined, NOW)).toBe('asked');
  });

  it("answers not found for someone else's removal and for one that does not exist", async () => {
    h.removals!.rows.push(removal());
    expect(await requestRemovalReview('someone-else', 'rem-1', undefined, NOW)).toBe('not_found');
    expect(await requestRemovalReview('author', 'nope', undefined, NOW)).toBe('not_found');
    expect(h.removals!.rows[0]!.reviewRequestedAt).toBeNull();
  });
});

describe("the author's list", () => {
  it('shows kind, title, date and state, and nothing about the report', async () => {
    h.removals!.rows.push(
      removal({ reviewRequestedAt: NOW }),
      removal({ id: 'rem-2', reportId: 'report-secret-2', entityType: 'comment', entityId: 'c1', reversible: false }),
    );
    const items = await listMyRemovals('author', NOW);
    assertJsonSafe({ items });
    expect(items.map((i) => i.state)).toEqual(['asked', 'removed']);
    expect(items[0]).toMatchObject({ kind: 'study-deck', title: 'My <deck>', canAsk: false, reversible: true });
    expect(items[1]).toMatchObject({ kind: 'comment', title: null, canAsk: false, reversible: false });
    const body = JSON.stringify({ items });
    expect(body).not.toContain('report-secret');
    for (const key of ['reportId', 'reason', 'reporter', 'moderator', 'reviewedById', 'reviewNote', 'count']) {
      expect(body).not.toContain(`"${key}"`);
    }
  });

  it('offers the request on a fresh reversible removal only', async () => {
    h.removals!.rows.push(removal());
    expect((await listMyRemovals('author', NOW))[0]!.canAsk).toBe(true);
    expect((await listMyRemovals('author', new Date(NOW.getTime() + 20 * DAY)))[0]!.canAsk).toBe(false);
  });
});

describe('the admin decides', () => {
  it('restore clears the stamp only, never publishes, audits, and tells the author', async () => {
    h.removals!.rows.push(removal({ reviewRequestedAt: NOW }));
    const result = await decideRemovalReview('admin1', 'rem-1', 'restore', NOW);
    expect(result).toEqual({ ok: true, outcome: 'restored' });
    expect(h.deckUpdate).toHaveBeenCalledTimes(1);
    expect(h.deckUpdate).toHaveBeenCalledWith({
      where: { id: 'deck-1', moderatedAt: { not: null } },
      data: { moderatedAt: null },
    });
    expect(h.audit).toHaveBeenCalledWith({
      data: {
        adminId: 'admin1',
        action: 'removal-review.restore',
        targetType: 'study-deck',
        targetId: 'deck-1',
        detail: 'removal rem-1',
      },
    });
    expect(h.removals!.rows[0]).toMatchObject({
      reviewOutcome: 'restored',
      reviewedById: 'admin1',
      reviewDecidedAt: NOW,
    });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ userId: 'author', type: 'SYSTEM' });
    expect(previewOf(h.sent[0]!)).toMatchObject({
      key: 'removal-review-restored',
      params: { kind: 'study-deck' },
    });
  });

  it('uphold leaves the item alone, audits, and tells the author', async () => {
    h.removals!.rows.push(removal({ reviewRequestedAt: NOW }));
    expect(await decideRemovalReview('admin1', 'rem-1', 'uphold', NOW)).toEqual({ ok: true, outcome: 'upheld' });
    expect(h.deckUpdate).not.toHaveBeenCalled();
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(previewOf(h.sent[0]!)).toMatchObject({ key: 'removal-review-upheld', params: { kind: 'study-deck' } });
  });

  it('decides once: a second decision, and two admins at once, leave one winner and one notice', async () => {
    h.removals!.rows.push(removal({ reviewRequestedAt: NOW }));
    const both = await Promise.all([
      decideRemovalReview('admin1', 'rem-1', 'restore', NOW),
      decideRemovalReview('admin2', 'rem-1', 'uphold', NOW),
    ]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(h.sent).toHaveLength(1);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(await decideRemovalReview('admin3', 'rem-1', 'restore', NOW)).toEqual({
      ok: false,
      reason: 'already_decided',
    });
    expect(h.sent).toHaveLength(1);
  });

  it('refuses a review nobody asked for, a missing one, and a restore of a deleted item', async () => {
    h.removals!.rows.push(
      removal(),
      removal({ id: 'rem-2', reportId: 'r2', entityType: 'comment', reversible: false, reviewRequestedAt: NOW }),
    );
    expect(await decideRemovalReview('admin1', 'rem-1', 'restore', NOW)).toEqual({
      ok: false,
      reason: 'not_requested',
    });
    expect(await decideRemovalReview('admin1', 'nope', 'restore', NOW)).toEqual({ ok: false, reason: 'not_found' });
    expect(await decideRemovalReview('admin1', 'rem-2', 'restore', NOW)).toEqual({
      ok: false,
      reason: 'not_reversible',
    });
    expect(h.sent).toEqual([]);
    expect(h.deckUpdate).not.toHaveBeenCalled();
  });

  it('lists waiting reviews with the author and note, and reports no reporter', async () => {
    h.removals!.rows.push(
      removal({ reviewRequestedAt: NOW, reviewNote: 'A mistake.' }),
      removal({ id: 'rem-2', reportId: 'r2', reviewRequestedAt: NOW, reviewDecidedAt: NOW, reviewOutcome: 'upheld' }),
      removal({ id: 'rem-3', reportId: 'r3' }),
    );
    const pending = await listAdminRemovalReviews('pending');
    assertJsonSafe(pending);
    expect(pending.counts).toEqual({ pending: 1, decided: 1 });
    expect(pending.items).toHaveLength(1);
    expect(pending.items[0]).toMatchObject({
      id: 'rem-1',
      title: 'My <deck>',
      reviewNote: 'A mistake.',
      outcome: null,
    });
    expect(pending.items[0]!.author.handle).toBe('ann');
    const decided = await listAdminRemovalReviews('decided');
    expect(decided.items.map((i) => [i.id, i.outcome])).toEqual([['rem-2', 'upheld']]);
    expect(JSON.stringify(pending)).not.toContain('report-secret');
  });
});
