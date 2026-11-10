import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server, Socket } from 'socket.io';

/**
 * Casino stakes on hub shutdown: every stake debited for a round that has not
 * paid out is refunded exactly once when the socket hub stops, and nothing
 * pays afterwards.
 *
 *   - blackjack: base bet + split + double + insurance, mid-turn → one refund
 *     of the sum; a debit still in flight is refunded by its own handler, not
 *     twice
 *   - roulette: a spinning wheel's bets are refunded and the spin never pays;
 *     a spin whose payout is already in flight is left to it (paid once)
 *   - baccarat: bets on a deal in progress are refunded and the deal never pays
 *   - hold'em: stacks + pot contributions are cashed out once, mid-hand; once
 *     the pot has been awarded, only the stacks (which hold it) are paid
 *
 * Each case imports the handlers fresh: shutdown closes a module for good.
 */

const mocks = vi.hoisted(() => ({
  debit: vi.fn(),
  credit: vi.fn(),
  spin: vi.fn(),
}));

vi.mock('../../../../server/socket-server/prisma-client', () => ({
  getPrismaClient: () => ({
    $transaction: async (fn: (tx: unknown) => unknown) => fn({}),
  }),
}));
vi.mock('../../../../lib/economy/ledger-core', () => ({
  debitCoinsOn: (...args: unknown[]) => mocks.debit(...args),
  creditCoinsOn: (...args: unknown[]) => mocks.credit(...args),
  getBalanceOn: async () => 100,
  getBalancesOn: async (_tx: unknown, ids: string[]) => new Map(ids.map((id) => [id, 100])),
}));
vi.mock('../../../../server/socket-server/rate-limit', () => ({ checkRateLimit: () => true }));
vi.mock('../../../../server/socket-server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
// A stacked shoe, so the blackjack round reaches a split + double + insurance.
// drawCard pops from the end: player 8, 8; dealer A, 9; then 3 (split hand 1),
// 10 (its double → 21), 5 (split hand 2 → 13, still to act).
vi.mock('../../engine/blackjack/logic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../engine/blackjack/logic')>();
  const order = ['8', '8', 'A', '9', '3', '10', '5'];
  return {
    ...actual,
    createShoe: () => [
      ...Array.from({ length: 100 }, () => ({ suit: 'S', rank: '2' })),
      ...[...order].reverse().map((rank) => ({ suit: 'H', rank })),
    ],
  };
});
vi.mock('../../engine/roulette/logic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../engine/roulette/logic')>();
  return { ...actual, spin: () => mocks.spin() };
});

type Handler = (payload?: unknown) => unknown;

function makeIo() {
  const sockets = new Map<string, unknown>();
  const io = {
    to: () => ({ emit: () => {} }),
    sockets: { sockets },
  } as unknown as Server;
  return { io, sockets };
}

function makeSocket(io: ReturnType<typeof makeIo>, id: string, userId: string) {
  const handlers = new Map<string, Handler>();
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const socket = {
    id,
    connected: true,
    data: { userId, userName: userId },
    on: (event: string, h: Handler) => handlers.set(event, h),
    emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
    join: () => {},
    leave: () => {},
  };
  io.sockets.set(id, socket);
  return { socket: socket as unknown as Socket, handlers, emitted };
}

/** Let queued microtasks (the mocked $transaction chains) run. */
async function flush() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

function createdRoomId(emitted: Array<{ event: string; payload: unknown }>, event: string): string {
  return (emitted.find((e) => e.event === event)!.payload as { roomId: string }).roomId;
}

/** Total credited per user, and the credit calls themselves. */
function credits() {
  const byUser = new Map<string, number>();
  for (const [, userId, amount] of mocks.credit.mock.calls as [unknown, string, number][]) {
    byUser.set(userId, (byUser.get(userId) ?? 0) + amount);
  }
  return byUser;
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  mocks.debit.mockReset().mockResolvedValue(undefined);
  mocks.credit.mockReset().mockResolvedValue(undefined);
  mocks.spin.mockReset().mockReturnValue(17);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('blackjack shutdown refunds', () => {
  it('refunds bet + split + double + insurance once, mid-turn, and nothing pays afterwards', async () => {
    const bj = await import('../blackjack');
    const io = makeIo();
    bj.initializeBlackjackPublicTable(io.io);
    const a = makeSocket(io, 'bj-a', 'bj-user');
    bj.registerBlackjackHandlers(io.io, a.socket);
    a.handlers.get('bj:create_room')!({ name: 'T' });

    await a.handlers.get('bj:place_bet')!({ amount: 10 }); // sole bettor → dealt; dealer shows A
    await a.handlers.get('bj:take_insurance')!(); // 5
    a.handlers.get('bj:split')!(); // 10: 8+3 = 11
    await flush();
    a.handlers.get('bj:double_down')!(); // 10: 8+3+10 = 21 → hand 2 (8+5) to act
    await flush();
    const debited = mocks.debit.mock.calls.map((c) => c[2] as number);
    expect(debited).toEqual([10, 5, 10, 10]);
    expect(mocks.credit).not.toHaveBeenCalled();

    const summary = await bj.refundBlackjackOnShutdown();
    expect(summary).toMatchObject({
      claims: 1,
      amount: 35,
      refunded: 1,
      failed: 0,
      unconfirmed: 0,
    });
    expect(mocks.credit).toHaveBeenCalledTimes(1);
    expect(mocks.credit).toHaveBeenCalledWith(
      expect.anything(),
      'bj-user',
      35,
      expect.objectContaining({
        entityType: 'blackjack',
        idempotencyKey: expect.stringMatching(/^casino-shutdown:blackjack:/),
      }),
    );

    // Turn clock, dealer reveal, payout and results timers: nothing may pay.
    await vi.advanceTimersByTimeAsync(120_000);
    // Neither may the disconnect fan-out io.close() triggers, or a late leave.
    bj.handleBlackjackDisconnect(io.io, a.socket);
    a.handlers.get('bj:leave_room')!();
    a.handlers.get('bj:stand')!();
    await flush();
    expect(mocks.credit).toHaveBeenCalledTimes(1);
  });

  it('leaves a bet whose debit is still in flight to its handler: refunded once, and shutdown waits for it', async () => {
    const bj = await import('../blackjack');
    const io = makeIo();
    bj.initializeBlackjackPublicTable(io.io);
    const a = makeSocket(io, 'bj-a', 'bj-user');
    bj.registerBlackjackHandlers(io.io, a.socket);
    a.handlers.get('bj:create_room')!({ name: 'T' });

    const slow = deferred();
    mocks.debit.mockImplementationOnce(() => slow.promise);
    const pending = a.handlers.get('bj:place_bet')!({ amount: 10 });

    let settled = false;
    const shutdown = bj.refundBlackjackOnShutdown().then((s) => {
      settled = true;
      return s;
    });
    await flush();
    expect(settled).toBe(false); // still waiting on the in-flight debit

    slow.resolve();
    await pending;
    const summary = await shutdown;
    expect(summary.claims).toBe(0);
    expect(mocks.credit).toHaveBeenCalledTimes(1);
    expect(mocks.credit).toHaveBeenCalledWith(
      expect.anything(),
      'bj-user',
      10,
      expect.objectContaining({ note: expect.stringMatching(/refund/i) }),
    );
  });
});

describe('roulette shutdown refunds', () => {
  it('refunds the bets on a spinning wheel once, and the spin never pays', async () => {
    const rl = await import('../roulette');
    const io = makeIo();
    rl.initializeRoulette(io.io);
    const a = makeSocket(io, 'rl-a', 'rl-user');
    rl.registerRouletteHandlers(io.io, a.socket);
    a.handlers.get('rl:create_room')!({ name: 'T' });
    await a.handlers.get('rl:place_bet')!({ type: 'straight', numbers: [17], amount: 10 });
    await a.handlers.get('rl:place_bet')!({ type: 'straight', numbers: [5], amount: 4 });
    vi.advanceTimersByTime(25_000); // betting closes → spinning; the wheel lands on 17

    const summary = await rl.refundRouletteOnShutdown();
    expect(summary).toMatchObject({ claims: 1, amount: 14, refunded: 1 });
    expect([...credits()]).toEqual([['rl-user', 14]]);

    await vi.advanceTimersByTimeAsync(60_000); // spin timer + results: a straight-up 17 would pay 360
    rl.handleRouletteDisconnect(io.io, a.socket);
    await flush();
    expect(mocks.credit).toHaveBeenCalledTimes(1);
  });

  it('leaves a spin whose payout is already in flight to it: paid once, never refunded', async () => {
    const rl = await import('../roulette');
    const io = makeIo();
    rl.initializeRoulette(io.io);
    const a = makeSocket(io, 'rl-a', 'rl-user');
    rl.registerRouletteHandlers(io.io, a.socket);
    a.handlers.get('rl:create_room')!({ name: 'T' });
    await a.handlers.get('rl:place_bet')!({ type: 'straight', numbers: [17], amount: 10 });

    const slow = deferred();
    mocks.credit.mockImplementationOnce(() => slow.promise);
    vi.advanceTimersByTime(25_000 + 5_000); // spin, then the payout transaction starts
    await flush();
    expect(mocks.credit).toHaveBeenCalledTimes(1); // the payout, awaiting the DB

    const shutdown = rl.refundRouletteOnShutdown();
    slow.resolve();
    const summary = await shutdown;
    expect(summary.claims).toBe(0);
    expect(mocks.credit).toHaveBeenCalledTimes(1);
    expect(mocks.credit.mock.calls[0][2]).toBe(360);
    expect(mocks.credit.mock.calls[0][3]).toMatchObject({ note: 'Roulette payout' });
  });
});

describe('baccarat shutdown refunds', () => {
  it('refunds the bets on a deal in progress once, and the deal never pays', async () => {
    const bacc = await import('../baccarat');
    const io = makeIo();
    bacc.initializeBaccarat(io.io);
    const a = makeSocket(io, 'bacc-a', 'bacc-user');
    bacc.registerBaccaratHandlers(io.io, a.socket);
    a.handlers.get('bacc:create_room')!({ name: 'T' });
    // Player + banker: every outcome would pay something (a tie pushes both).
    await a.handlers.get('bacc:place_bet')!({ type: 'player', amount: 10 });
    await a.handlers.get('bacc:place_bet')!({ type: 'banker', amount: 10 });
    vi.advanceTimersByTime(20_000); // betting closes → the reveal starts
    await vi.advanceTimersByTimeAsync(900); // mid-reveal

    const summary = await bacc.refundBaccaratOnShutdown();
    expect(summary).toMatchObject({ claims: 1, amount: 20, refunded: 1 });
    expect([...credits()]).toEqual([['bacc-user', 20]]);

    await vi.advanceTimersByTimeAsync(60_000); // the rest of the reveal + results
    bacc.handleBaccaratDisconnect(io.io, a.socket);
    await flush();
    expect(mocks.credit).toHaveBeenCalledTimes(1);
  });
});

describe("hold'em shutdown cash-out", () => {
  async function seatTwo() {
    const he = await import('../holdem');
    const io = makeIo();
    he.initializeHoldem(io.io);
    const a = makeSocket(io, 'he-a', 'he-user-a');
    const b = makeSocket(io, 'he-b', 'he-user-b');
    he.registerHoldemHandlers(io.io, a.socket);
    he.registerHoldemHandlers(io.io, b.socket);
    a.handlers.get('holdem:create_room')!({ name: 'T' }); // buy-in 200
    await flush();
    const roomId = createdRoomId(a.emitted, 'holdem:room_created');
    b.handlers.get('holdem:join_room')!({ roomId }); // buy-in 200
    await flush();
    a.handlers.get('holdem:sit_in')!();
    b.handlers.get('holdem:sit_in')!(); // two seated → blinds posted, hand dealt
    expect(mocks.debit.mock.calls.map((c) => c[2])).toEqual([200, 200]);
    return { he, io, a, b };
  }

  it('cashes out stacks plus pot contributions once, mid-hand, and the hand never pays', async () => {
    const { he, io, a, b } = await seatTwo();
    // Whoever is to act raises to 50, putting more than the blinds in the pot.
    a.handlers.get('holdem:raise')!({ amount: 50 });
    b.handlers.get('holdem:raise')!({ amount: 50 });

    const summary = await he.cashOutHoldemOnShutdown();
    expect(summary).toMatchObject({ claims: 2, amount: 400, refunded: 2 });
    expect(credits()).toEqual(
      new Map([
        ['he-user-a', 200],
        ['he-user-b', 200],
      ]),
    );

    await vi.advanceTimersByTimeAsync(120_000); // turn timeouts, hand steps, results sweep
    he.handleHoldemDisconnect(io.io, a.socket);
    he.handleHoldemDisconnect(io.io, b.socket);
    a.handlers.get('holdem:leave_room')!();
    await flush();
    expect(mocks.credit).toHaveBeenCalledTimes(2);
  });

  it('pays only the stacks once the pot has been awarded (showdown reveal pending)', async () => {
    const { he, io, a, b } = await seatTwo();
    for (let i = 0; i < 2; i++) {
      a.handlers.get('holdem:all_in')!();
      b.handlers.get('holdem:all_in')!();
    }
    vi.advanceTimersByTime(1_500); // run-out → endHand awards the pot; the reveal waits 1.5s

    const summary = await he.cashOutHoldemOnShutdown();
    // The winner's stack holds the whole pot (or both hold half on a chop):
    // never more than the 400 bought in.
    expect(summary.amount).toBe(400);
    expect([...credits().values()].reduce((s, v) => s + v, 0)).toBe(400);

    await vi.advanceTimersByTimeAsync(120_000);
    he.handleHoldemDisconnect(io.io, a.socket);
    he.handleHoldemDisconnect(io.io, b.socket);
    await flush();
    expect(mocks.credit).toHaveBeenCalledTimes(summary.claims);
  });
});
