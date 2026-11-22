import { describe, expect, it } from 'vitest';
import {
  adminSeatLeft,
  asRole,
  canManage,
  canRemoveMember,
  isManagerAction,
  MAX_GROUP_ADMINS,
  needFor,
  pickSuccessor,
} from '@/lib/group-chat/roles';

const at = (n: number) => new Date(2026, 0, n);

describe('roles', () => {
  it('allows at most five admins', () => {
    expect(MAX_GROUP_ADMINS).toBe(5);
    expect(adminSeatLeft(4)).toBe(true);
    expect(adminSeatLeft(5)).toBe(false);
  });

  it('reads any stored role but admin as member', () => {
    expect(asRole('admin')).toBe('admin');
    expect(asRole('member')).toBe('member');
    expect(asRole('owner')).toBe('member');
    expect(asRole(null)).toBe('member');
    expect(asRole(undefined)).toBe('member');
  });

  it('puts the owner above every admin', () => {
    expect(canManage('o', 'member', 'o', 'owner')).toBe(true);
    expect(canManage('o', 'member', 'o', 'admin')).toBe(true);
    expect(canManage('o', 'admin', 'a', 'admin')).toBe(true);
    expect(canManage('o', 'admin', 'a', 'owner')).toBe(false);
    expect(canManage('o', 'member', 'm', 'admin')).toBe(false);
    expect(canManage(null, 'admin', 'a', 'owner')).toBe(false);
  });

  it('knows which actions an admin may take', () => {
    for (const a of ['rename', 'add', 'remove', 'invite-create', 'invite-list', 'invite-revoke'] as const) {
      expect(isManagerAction(a)).toBe(true);
      expect(needFor(a)).toBe('admin');
    }
    for (const a of ['set-admin', 'transfer', 'remove-admin', 'delete'] as const) {
      expect(isManagerAction(a)).toBe(false);
      expect(needFor(a)).toBe('owner');
    }
  });

  it('lets an admin remove ordinary members only', () => {
    expect(
      canRemoveMember('o', 'a', {
        userId: 'm',
        role: 'member',
      }),
    ).toBe(true);
    expect(
      canRemoveMember('o', 'a', {
        userId: 'b',
        role: 'admin',
      }),
    ).toBe(false);
    expect(
      canRemoveMember('o', 'a', {
        userId: 'o',
        role: 'member',
      }),
    ).toBe(false);
    expect(
      canRemoveMember('o', 'a', {
        userId: 'a',
        role: 'admin',
      }),
    ).toBe(false);
    expect(
      canRemoveMember('o', 'o', {
        userId: 'b',
        role: 'admin',
      }),
    ).toBe(true);
    expect(
      canRemoveMember('o', 'o', {
        userId: 'o',
        role: 'member',
      }),
    ).toBe(false);
  });

  it('picks the earliest admin, else the earliest member, ties by id, never the leaver', () => {
    const m = [
      {
        userId: 'o',
        joinedAt: at(1),
        role: 'member',
      },
      {
        userId: 'm1',
        joinedAt: at(2),
        role: 'member',
      },
      {
        userId: 'a2',
        joinedAt: at(4),
        role: 'admin',
      },
      {
        userId: 'a1',
        joinedAt: at(3),
        role: 'admin',
      },
    ];
    expect(pickSuccessor(m, 'o')).toEqual({
      userId: 'a1',
      wasAdmin: true,
    });
    expect(pickSuccessor(m, 'a1')).toEqual({
      userId: 'a2',
      wasAdmin: true,
    });
    expect(
      pickSuccessor(
        m.filter((x) => x.role === 'member'),
        'o',
      ),
    ).toEqual({
      userId: 'm1',
      wasAdmin: false,
    });
    expect(
      pickSuccessor(
        [
          {
            userId: 'b',
            joinedAt: at(2),
          },
          {
            userId: 'a',
            joinedAt: at(2),
          },
        ],
        'o',
      ),
    ).toEqual({
      userId: 'a',
      wasAdmin: false,
    });
    expect(
      pickSuccessor(
        [
          {
            userId: 'o',
            joinedAt: at(1),
          },
        ],
        'o',
      ),
    ).toBeNull();
  });
});
