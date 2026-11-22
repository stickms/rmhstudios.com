import { describe, expect, it, vi } from 'vitest';

/** A profile reset by account deletion (zero games played) must never be listed on the RMHBox board. */

const findMany = vi.hoisted(() => vi.fn(async () => []));
vi.mock('../prisma-client', () => ({
  getPrismaClient: () => ({
    rMHboxProfile: {
      findMany,
    },
    // Nobody is hidden here (the hidden set has its own tests).
    userProfile: { findMany: async () => [] },
    user: { findMany: async () => [] },
  }),
}));
vi.mock('../logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { LeaderboardService } from '../leaderboard';

describe('RMHBox leaderboard fetch', () => {
  it('asks only for profiles with games played', async () => {
    const handlers = new Map<string, (p: unknown) => Promise<void>>();
    const socket = {
      on: (e: string, fn: (p: unknown) => Promise<void>) => handlers.set(e, fn),
      emit: vi.fn(),
    };
    new LeaderboardService().handleConnection(socket as never);
    await handlers.get('rmhbox:leaderboard:fetch')!({
      metric: 'wins',
    });
    expect(findMany).toHaveBeenCalledTimes(1);
    const args = findMany.mock.calls[0] as unknown as [
      {
        where: unknown;
      },
    ];
    expect(args[0].where).toEqual({
      totalGamesPlayed: {
        gt: 0,
      },
    });
  });
});
