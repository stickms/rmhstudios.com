import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    handleChange: { findMany: h.findMany, deleteMany: h.deleteMany },
    user: { findUnique: h.userFindUnique },
  },
}));
vi.mock('@/lib/profile.server', () => ({ invalidateProfileLookup: vi.fn() }));
vi.mock('@/lib/user-display.server', () => ({ invalidateUserDisplay: vi.fn() }));
vi.mock('@/lib/auth/security-log.server', () => ({ recordSecurityEvent: vi.fn() }));

import { eraseDeletedHandleChanges } from '@/lib/account/handle-change-jobs.server';
import { getPreviouslyKnownAs } from '@/lib/handles/history.server';

const NOW = new Date('2026-12-01T00:00:00Z');
const CUTOFF = new Date('2026-11-01T00:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('eraseDeletedHandleChanges', () => {
  it('selects only deleted accounts’ rows older than the reclaim window, and re-checks that in the delete', async () => {
    h.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    h.deleteMany.mockResolvedValueOnce({ count: 2 });
    const n = await eraseDeletedHandleChanges(NOW, 1000);
    expect(n).toBe(2);
    const where = { createdAt: { lt: CUTOFF }, user: { banReason: 'account_deleted' } };
    expect(h.findMany.mock.calls[0]![0].where).toEqual(where);
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b'] }, ...where } });
  });

  it('works in batches until a short page', async () => {
    h.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]).mockResolvedValueOnce([{ id: 'c' }]);
    h.deleteMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 1 });
    expect(await eraseDeletedHandleChanges(NOW, 2)).toBe(3);
    expect(h.findMany).toHaveBeenCalledTimes(2);
  });

  it('does nothing when no row qualifies', async () => {
    h.findMany.mockResolvedValueOnce([]);
    expect(await eraseDeletedHandleChanges(NOW)).toBe(0);
    expect(h.deleteMany).not.toHaveBeenCalled();
  });
});

describe('getPreviouslyKnownAs', () => {
  it('returns nothing for a deleted account, without reading its handle history', async () => {
    h.userFindUnique.mockResolvedValueOnce({ id: 'u1', banReason: 'account_deleted' });
    expect(await getPreviouslyKnownAs('u1', { now: NOW })).toEqual([]);
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('still lists a live member’s recent former handles', async () => {
    h.userFindUnique.mockResolvedValueOnce({ id: 'u2', banReason: null });
    h.findMany.mockResolvedValueOnce([
      { userId: 'u2', oldHandle: 'old', newHandle: 'new', createdAt: new Date('2026-11-20T00:00:00Z') },
    ]);
    const out = await getPreviouslyKnownAs('u2', { now: NOW, currentHandle: 'new' });
    expect(out).toHaveLength(1);
  });
});
