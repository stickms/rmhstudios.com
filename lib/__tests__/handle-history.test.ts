import { describe, expect, it } from 'vitest';
import {
  HANDLE_CHANGE_COOLDOWN_MS,
  HANDLE_RECLAIM_BLOCK_MS,
  MAX_PREVIOUS_HANDLES,
  PREVIOUS_HANDLE_WINDOW_MS,
  canChangeHandleNow,
  handleChangeCooldownRemaining,
  isHandleReclaimBlocked,
  previousHandles,
  reclaimBlockRemaining,
  type HandleChangeRecord,
} from '@/lib/handles/history';
import {
  IMPERSONATION_ENTITY_TYPE,
  encodeImpersonationDetails,
  nameSimilarity,
  parseImpersonationDetails,
} from '@/lib/handles/impersonation';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-04T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

function change(overrides: Partial<HandleChangeRecord> = {}): HandleChangeRecord {
  return {
    userId: 'alice-id',
    oldHandle: 'alice',
    newHandle: 'alice2',
    createdAt: daysAgo(1),
    ...overrides,
  };
}

describe('handle-change cooldown', () => {
  it('is 30 days', () => {
    expect(HANDLE_CHANGE_COOLDOWN_MS).toBe(30 * DAY);
  });

  it('allows an account that has never changed its handle', () => {
    expect(canChangeHandleNow(null, false, NOW)).toBe(true);
    expect(handleChangeCooldownRemaining(null, NOW)).toBe(0);
  });

  it('blocks inside the window and reports how long is left', () => {
    expect(canChangeHandleNow(daysAgo(1), false, NOW)).toBe(false);
    expect(handleChangeCooldownRemaining(daysAgo(1), NOW)).toBe(29 * DAY);
    expect(canChangeHandleNow(daysAgo(29.9), false, NOW)).toBe(false);
  });

  it('opens up exactly at 30 days', () => {
    expect(canChangeHandleNow(daysAgo(30), false, NOW)).toBe(true);
    expect(handleChangeCooldownRemaining(daysAgo(30), NOW)).toBe(0);
    expect(handleChangeCooldownRemaining(daysAgo(45), NOW)).toBe(0);
  });

  it('lets an admin through — moderation cannot wait 30 days to rename an impersonator', () => {
    expect(canChangeHandleNow(daysAgo(1), true, NOW)).toBe(true);
  });
});

describe('reclaim block', () => {
  const releases = [change({ createdAt: daysAgo(5) })];

  it('is 30 days', () => {
    expect(HANDLE_RECLAIM_BLOCK_MS).toBe(30 * DAY);
  });

  it('stops a stranger taking a handle released last week', () => {
    expect(isHandleReclaimBlocked(releases, 'alice', { claimantId: 'mallory', now: NOW })).toBe(
      true,
    );
    expect(reclaimBlockRemaining(releases, 'alice', { claimantId: 'mallory', now: NOW })).toBe(
      25 * DAY,
    );
  });

  it('is case-insensitive about the handle being claimed', () => {
    expect(isHandleReclaimBlocked(releases, 'ALICE', { claimantId: 'mallory', now: NOW })).toBe(
      true,
    );
    expect(
      isHandleReclaimBlocked([change({ oldHandle: 'Alice' })], 'alice', {
        claimantId: 'mallory',
        now: NOW,
      }),
    ).toBe(true);
  });

  it('lets the original owner take their own handle back', () => {
    expect(isHandleReclaimBlocked(releases, 'alice', { claimantId: 'alice-id', now: NOW })).toBe(
      false,
    );
    expect(reclaimBlockRemaining(releases, 'alice', { claimantId: 'alice-id', now: NOW })).toBe(0);
  });

  it('lifts after 30 days', () => {
    const old = [change({ createdAt: daysAgo(31) })];
    expect(isHandleReclaimBlocked(old, 'alice', { claimantId: 'mallory', now: NOW })).toBe(false);
    expect(reclaimBlockRemaining(old, 'alice', { claimantId: 'mallory', now: NOW })).toBe(0);
  });

  it('uses the most recent release when a handle has moved twice', () => {
    const twice = [
      change({ userId: 'first', createdAt: daysAgo(40) }),
      change({ userId: 'second', createdAt: daysAgo(2) }),
    ];
    // The newest release is what the freeze runs from, whichever order rows arrive in.
    expect(isHandleReclaimBlocked(twice, 'alice', { claimantId: 'mallory', now: NOW })).toBe(true);
    expect(
      isHandleReclaimBlocked([...twice].reverse(), 'alice', { claimantId: 'mallory', now: NOW }),
    ).toBe(true);
    // …and only the person who released it most recently is exempt.
    expect(isHandleReclaimBlocked(twice, 'alice', { claimantId: 'second', now: NOW })).toBe(false);
    expect(isHandleReclaimBlocked(twice, 'alice', { claimantId: 'first', now: NOW })).toBe(true);
  });

  it('says nothing about a handle nobody released', () => {
    expect(isHandleReclaimBlocked(releases, 'bob', { claimantId: 'mallory', now: NOW })).toBe(
      false,
    );
    expect(isHandleReclaimBlocked([], 'alice', { now: NOW })).toBe(false);
    expect(isHandleReclaimBlocked(releases, '   ', { now: NOW })).toBe(false);
  });

  it('blocks an anonymous claim with no claimant id', () => {
    expect(isHandleReclaimBlocked(releases, 'alice', { now: NOW })).toBe(true);
  });
});

describe('previously known as', () => {
  it('is a 30-day window, newest first', () => {
    expect(PREVIOUS_HANDLE_WINDOW_MS).toBe(30 * DAY);
    const changes = [
      change({ oldHandle: 'first', newHandle: 'second', createdAt: daysAgo(10) }),
      change({ oldHandle: 'second', newHandle: 'third', createdAt: daysAgo(2) }),
    ];
    expect(previousHandles(changes, { currentHandle: 'third', now: NOW })).toEqual([
      { handle: 'second', changedAt: daysAgo(2) },
      { handle: 'first', changedAt: daysAgo(10) },
    ]);
  });

  it('drops changes older than the window', () => {
    const changes = [change({ oldHandle: 'ancient', createdAt: daysAgo(31) })];
    expect(previousHandles(changes, { now: NOW })).toEqual([]);
  });

  it('never lists the handle the account currently holds', () => {
    const changes = [
      change({ oldHandle: 'alice', newHandle: 'bob', createdAt: daysAgo(5) }),
      change({ oldHandle: 'bob', newHandle: 'alice', createdAt: daysAgo(1) }),
    ];
    expect(previousHandles(changes, { currentHandle: 'alice', now: NOW })).toEqual([
      { handle: 'bob', changedAt: daysAgo(1) },
    ]);
  });

  it('de-duplicates a handle that was held more than once', () => {
    const changes = [
      change({ oldHandle: 'alice', createdAt: daysAgo(3) }),
      change({ oldHandle: 'alice', createdAt: daysAgo(1) }),
    ];
    const result = previousHandles(changes, { currentHandle: 'zed', now: NOW });
    expect(result).toHaveLength(1);
    expect(result[0].changedAt).toEqual(daysAgo(1));
  });

  it('caps the list', () => {
    const changes = Array.from({ length: 6 }, (_, i) =>
      change({ oldHandle: `name${i}`, createdAt: daysAgo(i + 1) }),
    );
    expect(previousHandles(changes, { now: NOW })).toHaveLength(MAX_PREVIOUS_HANDLES);
  });
});

describe('impersonation report details', () => {
  it('round-trips the impersonated account through ContentReport.details', () => {
    const details = encodeImpersonationDetails({
      impersonatedUserId: 'ckreal123',
      impersonatedHandle: 'alice',
      note: 'Copied my avatar and bio.',
    });
    expect(details.startsWith('[impersonating]')).toBe(true);
    expect(parseImpersonationDetails(details)).toEqual({
      impersonatedUserId: 'ckreal123',
      impersonatedHandle: 'alice',
      note: 'Copied my avatar and bio.',
    });
  });

  it('works without a handle or a note', () => {
    const details = encodeImpersonationDetails({ impersonatedUserId: 'ckreal123' });
    expect(parseImpersonationDetails(details)).toEqual({
      impersonatedUserId: 'ckreal123',
      impersonatedHandle: null,
      note: '',
    });
  });

  it('stays inside the VarChar(1000) column', () => {
    const details = encodeImpersonationDetails({
      impersonatedUserId: 'ckreal123',
      impersonatedHandle: 'alice',
      note: 'x'.repeat(5000),
    });
    expect(details.length).toBeLessThanOrEqual(1000);
  });

  it('refuses to read structure out of a free-text report', () => {
    expect(parseImpersonationDetails(null)).toBeNull();
    expect(parseImpersonationDetails('')).toBeNull();
    expect(parseImpersonationDetails('this account is fake, see @alice')).toBeNull();
    // A reporter typing the marker into their note cannot forge a header:
    // the marker only counts on the FIRST line, and it needs the id form.
    expect(parseImpersonationDetails('note\n[impersonating] @alice (id: forged)')).toBeNull();
    expect(parseImpersonationDetails('[impersonating] @alice')).toBeNull();
  });

  it('does not carry an invalid handle through', () => {
    const parsed = parseImpersonationDetails('[impersonating] @A (id: ckreal123)');
    expect(parsed?.impersonatedUserId).toBe('ckreal123');
    expect(parsed?.impersonatedHandle).toBeNull();
  });

  it('names the queue signal explicitly', () => {
    expect(IMPERSONATION_ENTITY_TYPE).toBe('impersonation');
  });
});

describe('nameSimilarity', () => {
  it('scores identical names 1 and unrelated names low', () => {
    expect(nameSimilarity('Alice Smith', 'alice  smith')).toBe(1);
    expect(nameSimilarity('Alice', 'Bob')).toBeLessThan(0.4);
  });

  it('scores a one-character impostor very high', () => {
    expect(nameSimilarity('Alice Smith', 'Alicе Smith')).toBeGreaterThan(0.85);
    expect(nameSimilarity('Alice', 'Alicee')).toBeGreaterThan(0.8);
  });

  it('handles missing names without throwing', () => {
    expect(nameSimilarity(null, null)).toBe(0);
    expect(nameSimilarity('Alice', null)).toBe(0);
    expect(nameSimilarity(undefined, 'Alice')).toBe(0);
  });
});
