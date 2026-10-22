import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reconcileOrphanedGroupCalls } from '../group-call';

const mocks = vi.hoisted(() => ({
  prisma: {
    groupCall: { findMany: vi.fn(), updateMany: vi.fn() },
    groupCallParticipant: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
  logger: { info: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../prisma-client', () => ({
  getPrismaClient: () => mocks.prisma,
}));

vi.mock('../../logger', () => ({
  logger: mocks.logger,
}));

vi.mock('../../rate-limit', () => ({
  checkRateLimit: () => true,
}));

vi.mock('../party', () => ({
  isPartyMember: vi.fn(),
}));

describe('orphaned group-call reconciliation', () => {
  beforeEach(() => {
    mocks.prisma.groupCall.findMany.mockReset();
    mocks.prisma.groupCall.updateMany.mockReset().mockResolvedValue({ count: 1 });
    mocks.prisma.groupCallParticipant.updateMany.mockReset().mockResolvedValue({ count: 1 });
    mocks.prisma.$transaction.mockReset().mockImplementation(async (work) => work(mocks.prisma));
    mocks.logger.info.mockReset();
  });

  it('closes active and ringing rooms and settles their participant rows transactionally', async () => {
    mocks.prisma.groupCall.findMany.mockResolvedValue([
      {
        id: 'active-room',
        status: 'ACTIVE',
        participants: [{ userId: 'host', joinedAt: new Date(Date.now() - 30_000) }],
      },
      { id: 'ringing-room', status: 'RINGING', participants: [] },
    ]);

    await reconcileOrphanedGroupCalls();

    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.prisma.groupCallParticipant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { callId: 'active-room', userId: 'host', status: 'JOINED' },
        data: expect.objectContaining({ status: 'LEFT', durationSec: expect.any(Number) }),
      }),
    );
    expect(mocks.prisma.groupCallParticipant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { callId: { in: ['active-room', 'ringing-room'] }, status: 'INVITED' },
        data: expect.objectContaining({ status: 'MISSED' }),
      }),
    );
    expect(mocks.prisma.groupCall.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['ringing-room'] }, endedAt: null, status: 'RINGING' },
        data: expect.objectContaining({ status: 'MISSED' }),
      }),
    );
    expect(mocks.prisma.groupCall.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['active-room'] }, endedAt: null, status: 'ACTIVE' },
        data: expect.objectContaining({ status: 'ENDED' }),
      }),
    );
  });

  it('does not open a transaction when there are no orphaned rooms', async () => {
    mocks.prisma.groupCall.findMany.mockResolvedValue([]);

    await reconcileOrphanedGroupCalls();

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
