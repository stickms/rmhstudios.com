/* eslint-disable @typescript-eslint/no-explicit-any -- a small Prisma fake is untyped by nature. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Responsible play (W8) on the escrow stakes. Wager holds and tournament entry fees move
 * coins through `lib/wager/escrow.server.ts`, not the ledger's `debitCoinsOn`, so the
 * ledger's play-limit check never ran for them: a self-excluded member could still create,
 * accept or enter for coins. Hiding the pages is cosmetic; these writes must refuse, and
 * must refuse before any coin moves.
 */

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn(async () => {}) }));
vi.mock('@/lib/user-display', () => ({ userDisplaySelect: {}, resolveUser: (u: unknown) => u }));

import { acceptWager, createWager } from '@/lib/wager/wager.server';
import { registerForTournament } from '@/lib/tournaments/tournament.server';

const DAY = 24 * 60 * 60 * 1000;

const state = {
  limits: new Map<string, { selfExcludedUntil: Date | null; coolOffUntil: Date | null }>(),
  debits: [] as string[],
  wager: null as any,
  tournament: null as any,
};

function makeDb() {
  const tx: any = {
    userPlayLimits: {
      findUnique: vi.fn(async ({ where }: any) => {
        const row = state.limits.get(where.userId);
        return row ? { dailyCoinCap: null, pendingCap: null, pendingCapAt: null, ...row } : null;
      }),
    },
    userProfile: {
      upsert: vi.fn(async () => ({})),
      updateMany: vi.fn(async ({ where }: any) => {
        state.debits.push(where.userId);
        return { count: 1 };
      }),
    },
    coinTransaction: { create: vi.fn(async () => ({})), aggregate: vi.fn(async () => ({ _sum: { amount: 0 } })) },
    user: { findUnique: vi.fn(async ({ where }: any) => ({ id: where.id })) },
    wagerMatch: {
      create: vi.fn(async ({ data }: any) => (state.wager = { id: 'w1', ...data })),
      findUnique: vi.fn(async () =>
        state.wager
          ? {
              challenger: { id: state.wager.challengerId },
              opponent: null,
              createdAt: new Date(),
              ...state.wager,
            }
          : null,
      ),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    tournament: {
      findUnique: vi.fn(async () => ({ ...state.tournament, _count: { entrants: 0 } })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    tournamentEntrant: {
      count: vi.fn(async () => 0),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
    },
    $executeRaw: vi.fn(async () => 0),
  };
  tx.$transaction = vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
  return tx;
}

const openWager = () => ({
  id: 'w1',
  gameId: 'rmhtype',
  challengerId: 'host',
  opponentId: null,
  stakeCoins: 50,
  potCoins: 50,
  rakeBps: 0,
  status: 'OPEN',
  expiresAt: new Date(Date.now() + DAY),
});

beforeEach(() => {
  state.limits = new Map();
  state.debits = [];
  state.wager = null;
  state.tournament = {
    id: 't1',
    status: 'REGISTRATION',
    maxPlayers: 8,
    entryFeeCoins: 25,
    startsAt: null,
    checkInMinutes: null,
  };
});

describe('a self-excluded member cannot stake through escrow', () => {
  beforeEach(() => {
    state.limits.set('me', { selfExcludedUntil: new Date(Date.now() + 7 * DAY), coolOffUntil: null });
  });

  it('cannot create a wager', async () => {
    await expect(
      createWager({ challengerId: 'me', gameId: 'rmhtype', stakeCoins: 50 }, makeDb()),
    ).rejects.toMatchObject({ code: 'SELF_EXCLUDED', status: 403 });
    expect(state.debits).toEqual([]);
  });

  it('cannot accept a wager', async () => {
    state.wager = openWager();
    await expect(acceptWager({ matchId: 'w1', userId: 'me' }, makeDb())).rejects.toMatchObject({
      code: 'SELF_EXCLUDED',
    });
    expect(state.debits).toEqual([]);
  });

  it('cannot pay a tournament entry fee', async () => {
    await expect(registerForTournament({ tournamentId: 't1', userId: 'me' }, makeDb())).rejects.toMatchObject({
      code: 'SELF_EXCLUDED',
    });
    expect(state.debits).toEqual([]);
  });
});

describe('the other limits hold on escrow too', () => {
  it('a cool-off refuses the stake', async () => {
    state.limits.set('me', { selfExcludedUntil: null, coolOffUntil: new Date(Date.now() + DAY) });
    await expect(
      createWager({ challengerId: 'me', gameId: 'rmhtype', stakeCoins: 50 }, makeDb()),
    ).rejects.toMatchObject({ code: 'COOL_OFF_ACTIVE' });
    expect(state.debits).toEqual([]);
  });

  it('an ended exclusion, or none, lets the stake through', async () => {
    state.limits.set('me', { selfExcludedUntil: new Date(Date.now() - 1000), coolOffUntil: null });
    await createWager({ challengerId: 'me', gameId: 'rmhtype', stakeCoins: 50 }, makeDb());
    await registerForTournament({ tournamentId: 't1', userId: 'other' }, makeDb());
    expect(state.debits).toEqual(['me', 'other']);
  });
});
