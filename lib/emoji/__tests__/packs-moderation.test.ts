/* eslint-disable @typescript-eslint/no-explicit-any -- an in-memory stand-in for Prisma's loose where/data shapes */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Pack moderation is a compare-and-swap on `status`. Until it existed nothing
 * wrote APPROVED, so no pack was ever visible to anyone but its owner; what
 * matters now is that each decision lands exactly once, a removed pack cannot
 * be approved back, and a decision made on a stale view of the pack fails
 * instead of approving items the reviewer never saw.
 */

type Row = Record<string, any>;
const db = vi.hoisted(() => ({ packs: [] as Row[] }));
const logAdminAction = vi.hoisted(() => vi.fn(async () => {}));
const createNotification = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@/lib/admin-audit.server', () => ({ logAdminAction }));
vi.mock('@/lib/notifications.server', () => ({ createNotification }));
vi.mock('@/lib/prisma.server', () => {
  const eq = (a: unknown, b: unknown) =>
    a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
  const match = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'OR') return (v as Row[]).some((w) => match(row, w));
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('in' in v) return v.in.includes(row[k]);
        if ('gt' in v) return row[k] > v.gt;
        if ('not' in v) return row[k] !== v.not;
      }
      return eq(row[k], v);
    });
  const pick = (row: Row | undefined) => (row ? { ...row } : null);
  const prisma: any = {
    emojiPack: {
      findFirst: async ({ where }: Row) => pick(db.packs.find((r) => match(r, where))),
      findUnique: async ({ where }: Row) => pick(db.packs.find((r) => match(r, where))),
      updateMany: async ({ where, data }: Row) => {
        const hits = db.packs.filter((r) => match(r, where));
        for (const r of hits)
          Object.assign(r, data, { updatedAt: new Date(r.updatedAt.getTime() + 1) });
        return { count: hits.length };
      },
    },
  };
  return { prisma };
});

import { moderatePack } from '../packs.server';

const EDITED = new Date('2026-11-01T12:00:00.000Z');

function seed(overrides: Row = {}) {
  const row = {
    id: 'p1',
    slug: 'reaction-faces',
    name: 'Reaction faces',
    ownerId: 'owner',
    status: 'PENDING',
    visibility: 'public',
    itemCount: 3,
    updatedAt: EDITED,
    ...overrides,
  };
  db.packs.push(row);
  return row;
}

beforeEach(() => {
  db.packs = [];
  logAdminAction.mockClear();
  createNotification.mockClear();
});

describe('moderatePack', () => {
  it('approves a pending pack exactly once', async () => {
    seed();
    const first = await moderatePack('p1', 'approve', 'admin');
    expect(first).toEqual({ applied: true, status: 'APPROVED' });
    expect(db.packs[0].status).toBe('APPROVED');

    const second = await moderatePack('p1', 'approve', 'admin');
    expect(second).toEqual({ applied: false, status: 'APPROVED' });
    // The loser writes no second audit row and sends no second notification.
    expect(logAdminAction).toHaveBeenCalledTimes(1);
    expect(logAdminAction).toHaveBeenCalledWith('admin', 'emoji-pack.approve', expect.any(Object));
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner', entityType: 'emoji-pack', entityId: 'p1' }),
    );
  });

  it('resolves a pack by slug as well as id', async () => {
    seed();
    expect(await moderatePack('reaction-faces', 'approve', 'admin')).toEqual({
      applied: true,
      status: 'APPROVED',
    });
  });

  it('cannot approve a removed pack', async () => {
    seed({ status: 'REMOVED' });
    expect(await moderatePack('p1', 'approve', 'admin')).toEqual({
      applied: false,
      status: 'REMOVED',
    });
    expect(db.packs[0].status).toBe('REMOVED');
    expect(logAdminAction).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('cannot approve an empty pack', async () => {
    seed({ itemCount: 0 });
    expect((await moderatePack('p1', 'approve', 'admin')).applied).toBe(false);
    expect(db.packs[0].status).toBe('PENDING');
  });

  it('removes an approved pack, and tells the owner why', async () => {
    seed({ status: 'APPROVED' });
    expect(await moderatePack('p1', 'remove', 'admin', 'Contains slurs')).toEqual({
      applied: true,
      status: 'REMOVED',
    });
    expect(db.packs[0].status).toBe('REMOVED');
    expect(logAdminAction).toHaveBeenCalledWith(
      'admin',
      'emoji-pack.remove',
      expect.objectContaining({ targetType: 'emoji-pack', targetId: 'p1' }),
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ preview: expect.stringContaining('Contains slurs') }),
    );
    // Removal is terminal: neither decision applies again.
    expect((await moderatePack('p1', 'remove', 'admin')).applied).toBe(false);
    expect((await moderatePack('p1', 'approve', 'admin')).applied).toBe(false);
  });

  it('removes a pending pack', async () => {
    seed();
    expect((await moderatePack('p1', 'remove', 'admin')).applied).toBe(true);
    expect(db.packs[0].status).toBe('REMOVED');
  });

  it('refuses a decision made on a stale version of the pack', async () => {
    seed();
    // The owner added an item after the reviewer loaded the queue.
    db.packs[0].updatedAt = new Date(EDITED.getTime() + 60_000);
    expect(await moderatePack('p1', 'approve', 'admin', undefined, EDITED)).toEqual({
      applied: false,
      status: 'PENDING',
    });
    expect(db.packs[0].status).toBe('PENDING');
    // With the version it now has, the same decision applies.
    expect(
      (await moderatePack('p1', 'approve', 'admin', undefined, db.packs[0].updatedAt)).applied,
    ).toBe(true);
  });

  it('404s an unknown pack', async () => {
    await expect(moderatePack('nope', 'approve', 'admin')).rejects.toMatchObject({ status: 404 });
  });
});
