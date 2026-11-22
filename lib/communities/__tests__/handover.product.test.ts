import { describe, expect, it } from 'vitest';
import { DELETED_ACCOUNT_BAN_REASON } from '@/lib/account-lifecycle';
import {
  HANDOVER_TTL_DAYS,
  checkAdminAssign,
  checkOwner,
  checkRecipient,
  checkResponder,
  handoverDaysLeft,
  handoverExpiry,
  handoverState,
  orphanReason,
  refusalMessage,
  refusalStatus,
  type HandoverRefusal,
} from '@/lib/communities/handover';
import { MOD_ACTIONS, groupOfAction } from '@/lib/communities/modlog';

const NOW = new Date('2026-11-24T12:00:00Z');
const DAY = 86_400_000;

describe('offer lifetime', () => {
  it('expires seven days after it is made', () => {
    expect(HANDOVER_TTL_DAYS).toBe(7);
    expect(handoverExpiry(NOW).getTime() - NOW.getTime()).toBe(7 * DAY);
  });

  it('reads pending until the expiry instant, then expired; decided offers keep their status', () => {
    const expiresAt = handoverExpiry(NOW);
    expect(handoverState({ status: 'pending', expiresAt }, new Date(expiresAt.getTime() - 1))).toBe('pending');
    expect(handoverState({ status: 'pending', expiresAt }, expiresAt)).toBe('expired');
    expect(handoverState({ status: 'accepted', expiresAt }, new Date(expiresAt.getTime() + DAY))).toBe('accepted');
    expect(handoverState({ status: 'declined', expiresAt }, NOW)).toBe('declined');
  });

  it('counts whole days left, rounding up and never below zero', () => {
    const expiresAt = handoverExpiry(NOW);
    expect(handoverDaysLeft(expiresAt, NOW)).toBe(7);
    expect(handoverDaysLeft(expiresAt, new Date(NOW.getTime() + 1.5 * DAY))).toBe(6);
    expect(handoverDaysLeft(expiresAt, new Date(NOW.getTime() + 9 * DAY))).toBe(0);
  });
});

describe('who may act', () => {
  it('only the owner offers or cancels', () => {
    expect(checkOwner('a', 'a')).toBeNull();
    expect(checkOwner('b', 'a')).toBe('not-owner');
  });

  it('a recipient is a moderator who is not the owner, banned or blocked', () => {
    const ok = { ownerId: 'o', toId: 'm', toRole: 'MOD' as const, toBanned: false, blocked: false };
    expect(checkRecipient(ok)).toBeNull();
    expect(checkRecipient({ ...ok, toId: 'o' })).toBe('self');
    expect(checkRecipient({ ...ok, toRole: 'MEMBER' })).toBe('not-moderator');
    expect(checkRecipient({ ...ok, toRole: null })).toBe('not-moderator');
    expect(checkRecipient({ ...ok, toBanned: true })).toBe('recipient-banned');
    expect(checkRecipient({ ...ok, blocked: true })).toBe('blocked');
  });

  it('only the addressed member answers a pending, unexpired offer from the current owner', () => {
    const offer = { toId: 'm', fromId: 'o', status: 'pending', expiresAt: handoverExpiry(NOW) };
    const base = { userId: 'm', offer, createdById: 'o', now: NOW };
    expect(checkResponder(base)).toBeNull();
    expect(checkResponder({ ...base, userId: 'x' })).toBe('not-recipient');
    expect(checkResponder({ ...base, offer: null })).toBe('no-offer');
    expect(checkResponder({ ...base, createdById: 'z' })).toBe('owner-changed');
    expect(checkResponder({ ...base, now: new Date(NOW.getTime() + 8 * DAY) })).toBe('expired');
    expect(checkResponder({ ...base, offer: { ...offer, status: 'cancelled' } })).toBe('no-offer');
  });
});

describe('orphaned owners', () => {
  it('names a deleted tombstone, a banned owner, and nobody for an active or lapsed-ban account', () => {
    expect(orphanReason({ bannedUntil: new Date('9999-12-31'), banReason: DELETED_ACCOUNT_BAN_REASON }, NOW)).toBe(
      'deleted',
    );
    expect(orphanReason({ id: 'deleted-user', bannedUntil: null, banReason: null }, NOW)).toBe('deleted');
    expect(orphanReason({ bannedUntil: new Date(NOW.getTime() + DAY), banReason: 'spam' }, NOW)).toBe('banned');
    expect(orphanReason({ bannedUntil: new Date(NOW.getTime() - DAY), banReason: 'spam' }, NOW)).toBeNull();
    expect(orphanReason({ bannedUntil: null, banReason: null }, NOW)).toBeNull();
  });

  it('an admin assigns only when the owner is gone, to another moderator who is not banned', () => {
    const ok = { ownerOrphan: 'deleted' as const, toId: 'm', ownerId: 'o', toRole: 'MOD' as const, toBanned: false };
    expect(checkAdminAssign(ok)).toBeNull();
    expect(checkAdminAssign({ ...ok, ownerOrphan: null })).toBe('owner-active');
    expect(checkAdminAssign({ ...ok, toId: 'o' })).toBe('already-owner');
    expect(checkAdminAssign({ ...ok, toRole: 'MEMBER' })).toBe('not-moderator');
    expect(checkAdminAssign({ ...ok, toBanned: true })).toBe('recipient-banned');
  });
});

describe('refusals', () => {
  const codes: HandoverRefusal[] = [
    'not-owner',
    'self',
    'not-moderator',
    'recipient-banned',
    'blocked',
    'pending-exists',
    'no-offer',
    'not-recipient',
    'expired',
    'owner-changed',
    'owner-active',
    'already-owner',
  ];
  it('every code has a message and a 4xx status', () => {
    for (const c of codes) {
      expect(refusalMessage(c).length).toBeGreaterThan(0);
      expect(refusalStatus(c)).toBeGreaterThanOrEqual(400);
      expect(refusalStatus(c)).toBeLessThan(500);
    }
  });
});

describe('mod log', () => {
  it('records the transfer under the members filter', () => {
    expect(MOD_ACTIONS).toContain('ownership_transferred');
    expect(groupOfAction('ownership_transferred')).toBe('members');
  });
});
