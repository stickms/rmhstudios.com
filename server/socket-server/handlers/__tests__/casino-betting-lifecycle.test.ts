import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server, Socket } from 'socket.io';

/**
 * Coin-safety of the casino betting phase (roulette + blackjack): a debited
 * stake must either land in the round or be refunded — never vanish.
 *
 *   - a bet whose debit commits after betting closed is refunded
 *   - the "nobody bet" 2s restart timer cannot restart a betting phase that a
 *     join already started (it used to zero every debited bet)
 *   - leaving during betting refunds the uncommitted stake
 *   - a double-clicked blackjack bet debits once
 */

const mocks = vi.hoisted(() => ({
  debit: vi.fn(),
  credit: vi.fn(),
}));

vi.mock('../../prisma-client', () => ({
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
vi.mock('../../rate-limit', () => ({ checkRateLimit: () => true }));
vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { initializeRoulette, registerRouletteHandlers } from '../roulette';
import { initializeBlackjackPublicTable, registerBlackjackHandlers } from '../blackjack';

type Handler = (payload?: unknown) => unknown;

function makeIo() {
  const roomEmits: Array<{ room: string; event: string; payload: unknown }> = [];
  const sockets = new Map<string, unknown>();
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => roomEmits.push({ room, event, payload }),
    }),
    sockets: { sockets },
  } as unknown as Server;
  return { io, roomEmits, sockets };
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

/** Let queued microtasks (the mocked $transaction chain) run. */
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.debit.mockReset().mockResolvedValue(undefined);
  mocks.credit.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('roulette betting lifecycle', () => {
  it('refunds a bet whose debit lands after betting closed, and a stray restart cannot wipe the next round', async () => {
    const io = makeIo();
    initializeRoulette(io.io);
    const a = makeSocket(io, 'rl-a', 'rl-user-a');
    registerRouletteHandlers(io.io, a.socket);
    a.handlers.get('rl:create_room')!({ name: 'T' });
    const roomId = (a.emitted.find((e) => e.event === 'rl:room_created')!.payload as { roomId: string })
      .roomId;

    // The debit is slow: betting (25s) closes before it commits.
    const slow = deferred();
    mocks.debit.mockImplementationOnce(() => slow.promise);
    const pending = a.handlers.get('rl:place_bet')!({ type: 'straight', numbers: [17], amount: 10 });
    vi.advanceTimersByTime(25_000); // betting ends with no committed bets → idle + 2s restart
    slow.resolve();
    await pending;
    await flush();
    expect(mocks.credit).toHaveBeenCalledWith(
      expect.anything(),
      'rl-user-a',
      10,
      expect.objectContaining({ note: expect.stringMatching(/refund/i) }),
    );

    // A second player joins inside the 2s gap: betting starts now.
    const b = makeSocket(io, 'rl-b', 'rl-user-b');
    registerRouletteHandlers(io.io, b.socket);
    b.handlers.get('rl:join_room')!({ roomId });
    const phasesBefore = io.roomEmits.filter((e) => e.event === 'rl:betting_phase').length;
    await b.handlers.get('rl:place_bet')!({ type: 'straight', numbers: [5], amount: 5 });
    await flush();

    // The stale restart timer fires: it must not start another betting phase.
    vi.advanceTimersByTime(2_500);
    const phasesAfter = io.roomEmits.filter((e) => e.event === 'rl:betting_phase').length;
    expect(phasesAfter).toBe(phasesBefore);

    // Leaving during betting refunds B's uncommitted stake.
    mocks.credit.mockClear();
    b.handlers.get('rl:leave_room')!();
    await flush();
    expect(mocks.credit).toHaveBeenCalledWith(expect.anything(), 'rl-user-b', 5, expect.anything());
  });
});

describe('blackjack betting lifecycle', () => {
  it('debits a double-clicked bet once and refunds it when the player leaves during betting', async () => {
    const io = makeIo();
    initializeBlackjackPublicTable(io.io);
    const a = makeSocket(io, 'bj-a', 'bj-user-a');
    const b = makeSocket(io, 'bj-b', 'bj-user-b');
    registerBlackjackHandlers(io.io, a.socket);
    registerBlackjackHandlers(io.io, b.socket);
    a.handlers.get('bj:create_room')!({ name: 'T' });
    const roomId = (a.emitted.find((e) => e.event === 'bj:room_created')!.payload as { roomId: string })
      .roomId;
    b.handlers.get('bj:join_room')!({ roomId });

    const slow = deferred();
    mocks.debit.mockImplementationOnce(() => slow.promise);
    const first = a.handlers.get('bj:place_bet')!({ amount: 10 });
    const second = a.handlers.get('bj:place_bet')!({ amount: 10 });
    slow.resolve();
    await Promise.all([first, second]);
    await flush();
    expect(mocks.debit).toHaveBeenCalledTimes(1);

    // B has not bet, so betting is still open: A leaving refunds A's stake.
    mocks.credit.mockClear();
    a.handlers.get('bj:leave_room')!();
    await flush();
    expect(mocks.credit).toHaveBeenCalledWith(
      expect.anything(),
      'bj-user-a',
      10,
      expect.objectContaining({ note: expect.stringMatching(/refund/i) }),
    );
  });
});
