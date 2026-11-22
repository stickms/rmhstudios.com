import { describe, expect, it } from 'vitest';
import {
  SWEEP_BATCH_SIZE,
  SWEEP_CONFIRMS_PER_HOUR,
  SWEEP_DEFAULT_WINDOW_MS,
  SWEEP_MAX_ITEMS,
  SWEEP_MAX_WINDOW_MS,
  SWEEP_REFUSAL_STATUS,
  accountAgeDays,
  canUndoItem,
  excerpt,
  isOldAccount,
  overLimit,
  removalNoticeText,
  resolveWindow,
  restoreNoticeText,
} from '@/lib/admin/sweeps';
import { createSweepBody, listSweepsQuery } from '@/lib/admin/sweeps-schema';

const NOW = new Date('2026-11-28T12:00:00Z');
const DAY = 86_400_000;

describe('the limits the specification fixes', () => {
  it('are 5,000 items, batches of 100, ten confirms an hour, 30 days, a 24 hour default', () => {
    expect(SWEEP_MAX_ITEMS).toBe(5000);
    expect(SWEEP_BATCH_SIZE).toBe(100);
    expect(SWEEP_CONFIRMS_PER_HOUR).toBe(10);
    expect(SWEEP_MAX_WINDOW_MS).toBe(30 * DAY);
    expect(SWEEP_DEFAULT_WINDOW_MS).toBe(DAY);
  });

  it('overLimit refuses only above the cap', () => {
    expect(overLimit(SWEEP_MAX_ITEMS, 0)).toBe(false);
    expect(overLimit(4000, 1000)).toBe(false);
    expect(overLimit(4000, 1001)).toBe(true);
  });
});

describe('resolveWindow', () => {
  it('defaults to the last 24 hours', () => {
    const w = resolveWindow({}, NOW);
    expect(w).toEqual({ ok: true, from: new Date(NOW.getTime() - DAY), to: NOW });
  });

  it('accepts exactly 30 days and refuses 30 days and a second', () => {
    const to = NOW;
    expect(resolveWindow({ from: new Date(to.getTime() - 30 * DAY), to }, NOW).ok).toBe(true);
    expect(resolveWindow({ from: new Date(to.getTime() - 30 * DAY - 1000), to }, NOW)).toEqual({
      ok: false,
      reason: 'window-too-long',
    });
  });

  it('refuses an empty or reversed window and one that ends in the future', () => {
    expect(resolveWindow({ from: NOW, to: NOW }, NOW)).toEqual({ ok: false, reason: 'window-order' });
    expect(resolveWindow({ from: new Date(NOW.getTime() + 1000), to: NOW }, NOW)).toEqual({
      ok: false,
      reason: 'window-order',
    });
    expect(resolveWindow({ to: new Date(NOW.getTime() + 10 * 60_000) }, NOW)).toEqual({
      ok: false,
      reason: 'window-future',
    });
  });
});

describe('canUndoItem', () => {
  const removedAt = new Date('2026-11-28T11:00:00.000Z');
  it('is true only while the item is in the state the sweep left it', () => {
    expect(canUndoItem({ deletedAt: new Date(removedAt), deletedBy: 'moderator' }, removedAt)).toBe(true);
  });
  it("is false for a later removal (a different deletedAt), the author's deletion, a restored or missing item", () => {
    expect(canUndoItem({ deletedAt: new Date(removedAt.getTime() + 1), deletedBy: 'moderator' }, removedAt)).toBe(
      false,
    );
    expect(canUndoItem({ deletedAt: new Date(removedAt), deletedBy: 'author' }, removedAt)).toBe(false);
    expect(canUndoItem({ deletedAt: new Date(removedAt), deletedBy: null }, removedAt)).toBe(false);
    expect(canUndoItem({ deletedAt: null, deletedBy: null }, removedAt)).toBe(false);
    expect(canUndoItem(null, removedAt)).toBe(false);
  });
});

describe('account context', () => {
  it('counts whole days and calls an account old after 90', () => {
    expect(accountAgeDays(new Date(NOW.getTime() - 90.9 * DAY), NOW)).toBe(90);
    expect(accountAgeDays(new Date(NOW.getTime() + DAY), NOW)).toBe(0);
    expect(isOldAccount(90)).toBe(false);
    expect(isOldAccount(91)).toBe(true);
  });
});

describe('the notices', () => {
  it('say how many, why, and whether a strike was added', () => {
    expect(removalNoticeText(352, 'Link spam', false)).toBe(
      '352 posts and replies were removed by site moderation. Reason: Link spam.',
    );
    expect(removalNoticeText(1, 'Link spam', true)).toContain('1 post or reply was removed');
    expect(removalNoticeText(1, 'Link spam', true)).toContain('A strike was added');
    expect(restoreNoticeText(350)).toBe('350 posts and replies were restored by site moderation.');
  });

  it('never exceed the notification text column', () => {
    expect(removalNoticeText(2, 'x'.repeat(500), true).length).toBeLessThanOrEqual(1000);
  });
});

describe('every refusal has an HTTP status', () => {
  it('maps the rate limit to 429, the cap to 422 and an admin subject to 403', () => {
    expect(SWEEP_REFUSAL_STATUS['confirm-limit']).toBe(429);
    expect(SWEEP_REFUSAL_STATUS['over-limit']).toBe(422);
    expect(SWEEP_REFUSAL_STATUS['subject-admin']).toBe(403);
    for (const status of Object.values(SWEEP_REFUSAL_STATUS)) expect(status).toBeGreaterThanOrEqual(400);
  });
});

describe('excerpt', () => {
  it('collapses whitespace and caps the length', () => {
    expect(excerpt('  a \n\n b  ')).toBe('a b');
    expect(excerpt('x'.repeat(300), 10)).toBe(`${'x'.repeat(9)}…`);
    expect(excerpt(null)).toBe('');
  });
});

describe('the zod schemas', () => {
  const ok = { subjectId: 'u1', reason: 'Posted 300 links in an hour' };
  it('default to posts and replies, no strike', () => {
    expect(createSweepBody.parse(ok)).toMatchObject({ includePosts: true, includeReplies: true, strike: false });
  });
  it('need a reason of 10 to 500 characters and at least one kind', () => {
    expect(createSweepBody.safeParse({ ...ok, reason: 'too short' }).success).toBe(false);
    expect(createSweepBody.safeParse({ ...ok, reason: 'x'.repeat(501) }).success).toBe(false);
    expect(createSweepBody.safeParse({ ...ok, includePosts: false, includeReplies: false }).success).toBe(false);
    expect(createSweepBody.safeParse({ ...ok, includePosts: false }).success).toBe(true);
  });
  it('refuse a missing subject and a date that is not one', () => {
    expect(createSweepBody.safeParse({ reason: ok.reason }).success).toBe(false);
    expect(createSweepBody.safeParse({ ...ok, from: 'yesterday-ish' }).success).toBe(false);
    expect(createSweepBody.safeParse({ ...ok, from: '2026-11-27T00:00:00Z' }).success).toBe(true);
  });
  it('the list query takes one subject', () => {
    expect(listSweepsQuery.parse({})).toEqual({});
    expect(listSweepsQuery.parse({ subject: 'u1' })).toEqual({ subject: 'u1' });
  });
});
