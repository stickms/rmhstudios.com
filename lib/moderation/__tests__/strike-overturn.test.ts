import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The shared recount-and-lift (appeals and the spam-sweep undo): voiding a strike lifts only the auto-ban. */

const m = vi.hoisted(() => ({
  prisma: {
    userStrike: { findUnique: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    user: { updateMany: vi.fn() },
  },
  drop: vi.fn(async () => {}),
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: m.prisma }));
vi.mock('@/lib/admin-audit.server', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/rmhmusic/learn/social/board-cache.server', () => ({ dropLearnerBoardCaches: m.drop }));

import { liftAutoBanIfNoLongerApplies, overturnStrike } from '@/lib/moderation/strikes.server';
import { AUTO_BAN_REASON } from '@/lib/moderation/standing.server';

beforeEach(() => {
  vi.clearAllMocks();
  m.prisma.user.updateMany.mockResolvedValue({ count: 1 });
});

describe('liftAutoBanIfNoLongerApplies', () => {
  it('lifts a ban carrying exactly the auto-ban reason once fewer than three strikes count', async () => {
    m.prisma.userStrike.count.mockResolvedValue(2);
    expect(await liftAutoBanIfNoLongerApplies('u1')).toBe(true);
    expect(m.prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'u1', banReason: AUTO_BAN_REASON }),
        data: { bannedUntil: null, banReason: null },
      }),
    );
    expect(m.drop).toHaveBeenCalled();
  });

  it('leaves the ban while three strikes still count', async () => {
    m.prisma.userStrike.count.mockResolvedValue(3);
    expect(await liftAutoBanIfNoLongerApplies('u1')).toBe(false);
    expect(m.prisma.user.updateMany).not.toHaveBeenCalled();
  });
});

describe('overturnStrike', () => {
  it('marks the strike OVERTURNED the way an appeal does, then recounts', async () => {
    m.prisma.userStrike.findUnique.mockResolvedValue({ userId: 'u1' });
    m.prisma.userStrike.updateMany.mockResolvedValue({ count: 1 });
    m.prisma.userStrike.count.mockResolvedValue(0);
    expect(await overturnStrike({ strikeId: 's1', adminId: 'a1', note: 'undone' })).toEqual({
      overturned: true,
      banLifted: true,
    });
    expect(m.prisma.userStrike.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1', appealStatus: { not: 'OVERTURNED' } },
        data: expect.objectContaining({ appealStatus: 'OVERTURNED', appealAdminId: 'a1' }),
      }),
    );
  });

  it('does nothing for a strike already overturned or missing', async () => {
    m.prisma.userStrike.findUnique.mockResolvedValue({ userId: 'u1' });
    m.prisma.userStrike.updateMany.mockResolvedValue({ count: 0 });
    expect(await overturnStrike({ strikeId: 's1', adminId: 'a1', note: 'x' })).toEqual({
      overturned: false,
      banLifted: false,
    });
    expect(m.prisma.userStrike.count).not.toHaveBeenCalled();
    m.prisma.userStrike.findUnique.mockResolvedValue(null);
    expect((await overturnStrike({ strikeId: 'nope', adminId: 'a1', note: 'x' })).overturned).toBe(false);
  });
});
