import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: { groupCallParticipant: { findMany: mocks.findMany } },
}));

vi.mock('@/lib/user-display', () => ({
  resolveUser: (user: unknown) => user,
  userDisplaySelect: { id: true },
}));

vi.mock('@/lib/presence.server', () => ({ getActiveFriends: vi.fn() }));
vi.mock('@/lib/search/people.server', () => ({ searchPeople: vi.fn() }));
vi.mock('@/lib/communities/access.server', () => ({ getRole: vi.fn() }));

describe('group call history roster preview', () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
  });

  it('bounds the participant join and returns the count for the full roster', async () => {
    const preview = Array.from({ length: 8 }, (_, index) => ({
      user: { id: `user-${index}` },
    }));
    mocks.findMany.mockResolvedValue([
      {
        status: 'JOINED',
        invitedAt: new Date('2026-01-01T00:00:00Z'),
        joinedAt: new Date('2026-01-01T00:00:00Z'),
        leftAt: null,
        durationSec: 0,
        call: {
          id: 'call-id',
          hostId: 'viewer',
          origin: 'COMMUNITY',
          communityId: 'community-id',
          partyId: null,
          conversationId: null,
          status: 'ENDED',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          startedAt: new Date('2026-01-01T00:00:00Z'),
          endedAt: new Date('2026-01-01T00:01:00Z'),
          peakParticipants: 8,
          _count: { participants: 27 },
          participants: preview,
        },
      },
    ]);

    const { getGroupCallHistory } = await import('@/lib/groupcall.server');
    const result = await getGroupCallHistory('viewer');

    expect(
      mocks.findMany.mock.calls[0][0].select.call.select.participants.take,
    ).toBe(8);
    expect(result.calls[0].participantCount).toBe(27);
    expect(result.calls[0].participants).toHaveLength(8);
  });
});
