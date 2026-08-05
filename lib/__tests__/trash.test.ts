import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  TRASH_WINDOW_DAYS_FREE,
  TRASH_WINDOW_DAYS_MEMBER,
  checkPurgeEligibility,
  checkRestoreEligibility,
  daysRemaining,
  excerptOf,
  isTrashKind,
  refusalStatus,
  resolveDeletedBy,
  trashExpiresAt,
  trashWindowDays,
  type ParentState,
  type RestoreCandidate,
} from '@/lib/trash/types';

/**
 * The recycle bin's rules (plan I1).
 *
 * All of this is the "restore is not `deletedAt = null`" half — who may restore
 * what, for how long, and with which ancestors intact. It is unit-tested rather
 * than integration-tested on purpose: the decision is the part with teeth (a
 * moderated account undoing its own moderation is the failure that matters), and
 * `lib/trash/types.ts` is deliberately free of Prisma so the decision can be
 * exercised exhaustively without a database.
 */

const NOW = new Date('2026-08-04T12:00:00.000Z');
const ME = 'user_me';

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

function candidate(overrides: Partial<RestoreCandidate> = {}): RestoreCandidate {
  return {
    ownerId: ME,
    deletedAt: daysAgo(1),
    deletedBy: 'author',
    deletedByAdmin: false,
    ...overrides,
  };
}

const livingParent: ParentState = { label: 'post', exists: true, deletedAt: null };

describe('resolveDeletedBy — the moderation discriminator', () => {
  it('trusts an explicit value', () => {
    expect(resolveDeletedBy({ deletedBy: 'author' })).toBe('author');
    expect(resolveDeletedBy({ deletedBy: 'moderator' })).toBe('moderator');
    expect(resolveDeletedBy({ deletedBy: 'system' })).toBe('system');
  });

  it('falls back to deletedByAdmin for rows written before the column existed', () => {
    // The two shipped delete routes still write only `deletedByAdmin`, so this
    // fallback is what every historical row and every delete made today goes
    // through. Getting it backwards would either make the feature inert or hand
    // moderated users an undo button.
    expect(resolveDeletedBy({ deletedBy: null, deletedByAdmin: false })).toBe('author');
    expect(resolveDeletedBy({ deletedBy: null, deletedByAdmin: true })).toBe('moderator');
  });

  it('fails closed on a value it does not recognise', () => {
    expect(resolveDeletedBy({ deletedBy: 'automod', deletedByAdmin: true })).toBe('moderator');
    expect(resolveDeletedBy({ deletedBy: '', deletedByAdmin: true })).toBe('moderator');
  });
});

describe('retention window', () => {
  it('gives free accounts 30 days and members 90', () => {
    expect(trashWindowDays('free')).toBe(TRASH_WINDOW_DAYS_FREE);
    expect(trashWindowDays('starter')).toBe(TRASH_WINDOW_DAYS_MEMBER);
    expect(trashWindowDays('pro')).toBe(TRASH_WINDOW_DAYS_MEMBER);
    expect(trashWindowDays('enterprise')).toBe(TRASH_WINDOW_DAYS_MEMBER);
  });

  it('derives the window from the feature registry, not a second table', () => {
    // `trash-extended` has minTier `starter`, so every tier at or above it must
    // get the long window. If the registry moves, this moves with it.
    expect(trashWindowDays('starter')).toBeGreaterThan(trashWindowDays('free'));
  });

  it('expires exactly `windowDays` after the deletion', () => {
    const deletedAt = new Date('2026-01-01T00:00:00.000Z');
    expect(trashExpiresAt(deletedAt, 30).toISOString()).toBe('2026-01-31T00:00:00.000Z');
    expect(trashExpiresAt(deletedAt, 90).toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('rounds the remaining days up so a live Restore never reads "0 days"', () => {
    // Four hours left is still a day the user can act in. Flooring here would
    // put "0 days left" beside a button that works.
    const almostGone = new Date(NOW.getTime() - (30 * DAY_MS - 4 * 60 * 60 * 1000));
    expect(daysRemaining(almostGone, 30, NOW)).toBe(1);
  });

  it('floors at zero once the window has passed', () => {
    expect(daysRemaining(daysAgo(31), 30, NOW)).toBe(0);
    expect(daysRemaining(daysAgo(400), 30, NOW)).toBe(0);
  });

  it('counts a fresh deletion as the whole window', () => {
    expect(daysRemaining(NOW, 30, NOW)).toBe(30);
    expect(daysRemaining(daysAgo(10), 30, NOW)).toBe(20);
  });
});

describe('checkRestoreEligibility', () => {
  it('restores an author-deleted row inside the window', () => {
    expect(checkRestoreEligibility(ME, candidate(), NOW, 30)).toEqual({ ok: true });
  });

  it('refuses somebody else’s row before revealing anything about it', () => {
    // Ordered first on purpose: an attacker probing ids must not be able to tell
    // "moderated" from "expired" on a stranger's post.
    const theirs = candidate({ ownerId: 'user_them', deletedBy: 'moderator' });
    expect(checkRestoreEligibility(ME, theirs, NOW, 30)).toEqual({
      ok: false,
      reason: 'not-owner',
    });
  });

  it('refuses a row that is not deleted', () => {
    expect(checkRestoreEligibility(ME, candidate({ deletedAt: null }), NOW, 30)).toEqual({
      ok: false,
      reason: 'not-deleted',
    });
  });

  it('refuses moderator removals', () => {
    expect(checkRestoreEligibility(ME, candidate({ deletedBy: 'moderator' }), NOW, 30)).toEqual({
      ok: false,
      reason: 'moderated',
    });
  });

  it('refuses automod removals', () => {
    expect(checkRestoreEligibility(ME, candidate({ deletedBy: 'system' }), NOW, 30)).toEqual({
      ok: false,
      reason: 'moderated',
    });
  });

  it('refuses a legacy admin deletion that carries no deletedBy', () => {
    const legacy = candidate({ deletedBy: null, deletedByAdmin: true });
    expect(checkRestoreEligibility(ME, legacy, NOW, 30)).toEqual({
      ok: false,
      reason: 'moderated',
    });
  });

  it('refuses once the retention window has passed', () => {
    expect(checkRestoreEligibility(ME, candidate({ deletedAt: daysAgo(31) }), NOW, 30)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('accepts the same row for a member on the longer window', () => {
    // The identical row, refused on 30 days, restores on 90 — which is the whole
    // observable difference the `trash-extended` feature buys.
    const row = candidate({ deletedAt: daysAgo(45) });
    expect(checkRestoreEligibility(ME, row, NOW, TRASH_WINDOW_DAYS_FREE).ok).toBe(false);
    expect(checkRestoreEligibility(ME, row, NOW, TRASH_WINDOW_DAYS_MEMBER)).toEqual({ ok: true });
  });

  it('refuses when a parent is hard-gone, with the specific reason', () => {
    const orphan = candidate({
      parents: [{ label: 'post', exists: false, deletedAt: null }],
    });
    expect(checkRestoreEligibility(ME, orphan, NOW, 30)).toEqual({
      ok: false,
      reason: 'parent-missing',
    });
  });

  it('refuses when a parent is itself in the bin', () => {
    const nested = candidate({
      parents: [{ label: 'post', exists: true, deletedAt: daysAgo(2) }],
    });
    expect(checkRestoreEligibility(ME, nested, NOW, 30)).toEqual({
      ok: false,
      reason: 'parent-deleted',
    });
  });

  it('checks every ancestor, not just the first', () => {
    const deepOrphan = candidate({
      parents: [livingParent, { label: 'comment', exists: false, deletedAt: null }],
    });
    expect(checkRestoreEligibility(ME, deepOrphan, NOW, 30)).toEqual({
      ok: false,
      reason: 'parent-missing',
    });
  });

  it('accepts when every ancestor is alive', () => {
    const nested = candidate({
      parents: [livingParent, { label: 'comment', exists: true, deletedAt: null }],
    });
    expect(checkRestoreEligibility(ME, nested, NOW, 30)).toEqual({ ok: true });
  });

  it('reports moderation before the parent chain', () => {
    // A moderated comment under a deleted post must say "moderated" — telling
    // the author to go restore the parent first would be a lie.
    const both = candidate({
      deletedBy: 'moderator',
      parents: [{ label: 'post', exists: false, deletedAt: null }],
    });
    expect(checkRestoreEligibility(ME, both, NOW, 30)).toEqual({
      ok: false,
      reason: 'moderated',
    });
  });
});

describe('checkPurgeEligibility', () => {
  it('lets the author destroy their own deleted row', () => {
    expect(checkPurgeEligibility(ME, candidate())).toEqual({ ok: true });
  });

  it('ignores expiry — finishing the job early is the point of the button', () => {
    expect(checkPurgeEligibility(ME, candidate({ deletedAt: daysAgo(400) }))).toEqual({ ok: true });
  });

  it('still refuses moderated rows, which are moderation evidence', () => {
    expect(checkPurgeEligibility(ME, candidate({ deletedBy: 'moderator' }))).toEqual({
      ok: false,
      reason: 'moderated',
    });
    expect(checkPurgeEligibility(ME, candidate({ deletedBy: null, deletedByAdmin: true }))).toEqual(
      {
        ok: false,
        reason: 'moderated',
      },
    );
  });

  it('refuses a live row and somebody else’s row', () => {
    expect(checkPurgeEligibility(ME, candidate({ deletedAt: null })).ok).toBe(false);
    expect(checkPurgeEligibility(ME, candidate({ ownerId: 'user_them' }))).toEqual({
      ok: false,
      reason: 'not-owner',
    });
  });
});

describe('refusalStatus', () => {
  it('hides existence behind a 404 for a row the caller does not own', () => {
    expect(refusalStatus('not-owner')).toBe(404);
    expect(refusalStatus('not-found')).toBe(404);
  });

  it('uses 403 for moderation and 409 for state conflicts', () => {
    expect(refusalStatus('moderated')).toBe(403);
    expect(refusalStatus('expired')).toBe(409);
    expect(refusalStatus('parent-missing')).toBe(409);
    expect(refusalStatus('parent-deleted')).toBe(409);
    expect(refusalStatus('not-deleted')).toBe(409);
  });
});

describe('excerptOf', () => {
  it('collapses whitespace to a single line', () => {
    expect(excerptOf('  hello\n\n  world  ')).toBe('hello world');
  });

  it('truncates with an ellipsis and never exceeds the budget', () => {
    const long = 'a'.repeat(400);
    const out = excerptOf(long);
    expect(out.length).toBe(160);
    expect(out.endsWith('…')).toBe(true);
  });

  it('leaves short content alone', () => {
    expect(excerptOf('short')).toBe('short');
    expect(excerptOf('')).toBe('');
  });
});

describe('isTrashKind', () => {
  it('accepts only the two soft-deletable models', () => {
    expect(isTrashKind('post')).toBe(true);
    expect(isTrashKind('comment')).toBe(true);
    // The kind comes off the URL, so this is a real input guard.
    expect(isTrashKind('user')).toBe(false);
    expect(isTrashKind('')).toBe(false);
    expect(isTrashKind(undefined)).toBe(false);
  });
});

describe('media retention covers the restore window', () => {
  it('never reclaims a deleted post’s media before the recycle bin releases it', async () => {
    // The bug this pins: media was swept at 7 days while posts stayed
    // restorable for 30 (free) or 90 (member). Restoring on day 20 returned a
    // post whose images were already gone, with nothing explaining why.
    const { DELETED_POST_GRACE_MS } = await import('@/lib/media/sweep-policy');
    const { TRASH_WINDOW_DAYS_MEMBER, TRASH_WINDOW_DAYS_FREE } = await import('@/lib/trash/types');
    const longestWindowMs = TRASH_WINDOW_DAYS_MEMBER * 24 * 60 * 60 * 1000;
    expect(DELETED_POST_GRACE_MS).toBeGreaterThanOrEqual(longestWindowMs);
    expect(TRASH_WINDOW_DAYS_MEMBER).toBeGreaterThanOrEqual(TRASH_WINDOW_DAYS_FREE);
  });
});
