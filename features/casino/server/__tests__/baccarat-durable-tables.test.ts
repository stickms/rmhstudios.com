import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorld, last, type FakeSocket } from '../../../../server/socket-server/test-support/fake-world';
import { MemoryCasinoTableStore, type CasinoTableStore } from '../table-store';
import {
  parseStoredBaccaratTable,
  seatStake,
  unsavedTableClaims,
  type StoredBaccaratTable,
} from '../baccarat-table-state';

/**
 * Durable baccarat tables (third-pass audit OP3, `CASINO_DURABLE_TABLES=1`).
 *
 * Same method as `blackjack-durable-tables.test.ts`: a "process" is one fresh
 * import of `../baccarat`, a fake socket.io world and fake timers. What crosses
 * the restart is the table store (in-memory, carried over) and the ledger (an
 * in-memory stand-in for `ledger-core` that honours idempotency keys). The
 * same flow against real Postgres, real Socket.IO and Redis is
 * `testing/integration/casino-restart.test.ts`.
 */

const ledger = vi.hoisted(() => ({
  balances: new Map<string, number>(),
  keys: new Set<string>(),
  credits: [] as Array<{ userId: string; amount: number; note?: string; key?: string }>,
  debits: [] as Array<{ userId: string; amount: number; note?: string }>,
  /** When set, every credit waits on it (a settlement transaction in flight). */
  creditGate: null as Promise<void> | null,
  /** When set, the next credit throws once (a refund the database rejected). */
  failNextCredit: false,
  /** The next shoe `createShoe` hands out, as ranks in draw order. */
  shoe: [] as string[],
}));

vi.mock('../../../../server/socket-server/prisma-client', () => ({
  getPrismaClient: () => ({
    $transaction: async (fn: (tx: unknown) => unknown) => fn({}),
    coinTransaction: {
      findMany: async ({ where }: { where: { idempotencyKey: { in: string[] } } }) =>
        where.idempotencyKey.in.filter((k) => ledger.keys.has(k)).map((k) => ({ idempotencyKey: k })),
    },
  }),
}));
vi.mock('../../../../lib/economy/ledger-core', () => ({
  debitCoinsOn: async (_c: unknown, userId: string, amount: number, opts: { note?: string }) => {
    const have = ledger.balances.get(userId) ?? 0;
    if (have < amount) throw new Error('INSUFFICIENT_COINS');
    ledger.balances.set(userId, have - amount);
    ledger.debits.push({ userId, amount, note: opts.note });
  },
  creditCoinsOn: async (
    _c: unknown,
    userId: string,
    amount: number,
    opts: { note?: string; idempotencyKey?: string },
  ) => {
    if (ledger.creditGate) await ledger.creditGate;
    if (ledger.failNextCredit) {
      ledger.failNextCredit = false;
      throw new Error('database down');
    }
    if (opts.idempotencyKey) {
      if (ledger.keys.has(opts.idempotencyKey)) return { applied: false, replayed: true, transactionId: 'x' };
      ledger.keys.add(opts.idempotencyKey);
    }
    ledger.balances.set(userId, (ledger.balances.get(userId) ?? 0) + amount);
    ledger.credits.push({ userId, amount, note: opts.note, key: opts.idempotencyKey });
    return { applied: true, replayed: false, transactionId: 'x' };
  },
  getBalanceOn: async (_c: unknown, userId: string) => ledger.balances.get(userId) ?? 0,
  getBalancesOn: async (_c: unknown, ids: string[]) => new Map(ids.map((id) => [id, ledger.balances.get(id) ?? 0])),
}));
vi.mock('../../../../server/socket-server/rate-limit', () => ({ checkRateLimit: () => true }));
vi.mock('../../../../server/socket-server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../engine/baccarat/logic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../engine/baccarat/logic')>();
  return {
    ...actual,
    // drawCard pops from the end: the stacked ranks sit on top of 100 filler cards.
    createShoe: () => [
      ...Array.from({ length: 100 }, () => ({ suit: 'S', rank: '9' })),
      ...[...ledger.shoe].reverse().map((rank) => ({ suit: 'H', rank })),
    ],
  };
});

/**
 * Player 2, 3 (five: draws); banker K, 4 (four). The player draws a 5 (zero);
 * the banker, on four against a 5, draws a 3 (seven). Banker wins 7 to 0.
 */
const SHOE = ['2', 'K', '3', '4', '5', '3'];
/** What a shoe built after the restart would deal: if a restored deal drew from it, the hands would show it. */
const WRONG_SHOE = ['9', '9', '9', '9', '9', '9'];

const START = 1_000;
const BETTING_MS = 20_000;
/** Four reveals, then the two third cards, 800 ms apart. */
const DEAL_MS = 6 * 800;

type Call = (payload?: unknown) => unknown;
const call = (s: FakeSocket, event: string, payload?: unknown) => (s.handlers.get(event) as unknown as Call)(payload);

/** Let queued microtasks (the mocked transactions, the store writes) run. */
async function flush() {
  for (let i = 0; i < 80; i++) await Promise.resolve();
}

interface TableState {
  phase: string;
  roundNumber: number;
  playerHand: Array<{ rank: string }>;
  bankerHand: Array<{ rank: string }>;
  history: string[];
  players: Array<{ userId: string; totalBetThisRound: number; lastPayout: number }>;
}
interface RoundResult {
  result: string;
  playerHand: Array<{ rank: string }>;
  bankerHand: Array<{ rank: string }>;
  playerValue: number;
  bankerValue: number;
}

/** One hub process: fresh modules, a fresh socket world, durable tables on `store`. */
async function boot(store: CasinoTableStore) {
  vi.resetModules();
  const bacc = await import('../baccarat');
  const world = makeWorld(bacc.registerBaccaratHandlers);
  const restored = await bacc.restoreBaccaratTables(world.io, store);
  bacc.initializeBaccarat(world.io);
  const connect = (userId: string) => {
    const s = world.connect(`${userId}-${Math.random().toString(36).slice(2, 8)}`, { userId, userName: userId });
    // The handlers read `connected` when they prune seats after a round.
    (s as unknown as { connected: boolean }).connected = true;
    return s;
  };
  return { bacc, world, connect, restored };
}

type Process = Awaited<ReturnType<typeof boot>>;

/** Seat A and B. A puts 20 on banker, B 10 on player and 5 on the tie. Betting is still open. */
async function seatAndBet(p: Process) {
  const a = p.connect('user-a');
  const b = p.connect('user-b');
  call(a, 'bacc:create_room', { name: 'T' });
  const roomId = last<{ roomId: string }>(a, 'bacc:room_created')!.roomId;
  call(b, 'bacc:join_room', { roomId });
  await call(a, 'bacc:place_bet', { type: 'banker', amount: 20 });
  await call(b, 'bacc:place_bet', { type: 'player', amount: 10 });
  await call(b, 'bacc:place_bet', { type: 'tie', amount: 5 });
  await flush();
  return { a, b, roomId };
}

/** The same, then betting closes and the deal runs for `intoDealMs`. */
async function betAndDeal(p: Process, intoDealMs: number) {
  const seats = await seatAndBet(p);
  await vi.advanceTimersByTimeAsync(BETTING_MS + intoDealMs);
  await flush();
  return seats;
}

function stored(store: MemoryCasinoTableStore, roomId: string): StoredBaccaratTable | null {
  const raw = store.entries.get(`baccarat:${roomId}`);
  return raw ? parseStoredBaccaratTable(JSON.parse(raw)) : null;
}
const ranks = (cards: Array<{ rank: string }>) => cards.map((c) => c.rank);

const balances = () => ({ a: ledger.balances.get('user-a'), b: ledger.balances.get('user-b') });
/** Banker wins on seven: A's 20 pays 40; B's player and tie bets lose. */
const SETTLED = { a: START - 20 + 40, b: START - 15 };

function resetLedger() {
  ledger.balances.clear();
  ledger.balances.set('user-a', START);
  ledger.balances.set('user-b', START);
  ledger.keys.clear();
  ledger.credits.length = 0;
  ledger.debits.length = 0;
  ledger.creditGate = null;
  ledger.failNextCredit = false;
  ledger.shoe = SHOE;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetLedger();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a deploy during an open baccarat round', () => {
  // 1 s into the deal no third card is drawn; 3.5 s in the player has drawn and the banker has not.
  it.each([
    ['the first cards are being revealed', 1_000, 'dealing', ['2', '3'], ['K', '4']],
    ['the player has drawn a third card and the banker has not', 3_500, 'drawing', ['2', '3', '5'], ['K', '4']],
    ['both third cards are out and the result is not paid', 4_500, 'drawing', ['2', '3', '5'], ['K', '4', '3']],
  ] as const)(
    'restarted while %s: the same hands, result and balances as a round with no restart',
    async (_when, intoDealMs, phase, playerAtRest, bankerAtRest) => {
      // The round with no restart.
      const control = await boot(new MemoryCasinoTableStore());
      const c = await betAndDeal(control, DEAL_MS + 100);
      const expected = last<RoundResult>(c.a, 'bacc:round_result')!;
      expect(expected).toMatchObject({ result: 'banker', playerValue: 0, bankerValue: 7 });
      expect(ranks(expected.playerHand)).toEqual(['2', '3', '5']);
      expect(ranks(expected.bankerHand)).toEqual(['K', '4', '3']);
      expect(balances()).toEqual(SETTLED);
      const expectedCredits = ledger.credits.map((x) => [x.userId, x.amount, x.note]);

      // The same round, with the hub restarted part-way through the deal.
      resetLedger();
      const store = new MemoryCasinoTableStore();
      const first = await boot(store);
      const { roomId } = await betAndDeal(first, intoDealMs);
      const summary = await first.bacc.refundBaccaratOnShutdown();
      expect(summary).toMatchObject({ claims: 0, refunded: 0, failed: 0, unconfirmed: 0, saved: 1 });
      expect(ledger.credits).toEqual([]); // saved, so nothing is refunded
      const atRest = stored(store, roomId)!;
      expect(atRest).toMatchObject({ phase, settling: false });
      expect(ranks(atRest.playerHand)).toEqual(playerAtRest);
      expect(ranks(atRest.bankerHand)).toEqual(bankerAtRest);
      // The old process's reveal chain is dead: its remaining steps do nothing.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(ledger.credits).toEqual([]);

      ledger.shoe = WRONG_SHOE;
      const second = await boot(store);
      expect(second.restored).toEqual({ restored: 1, unreadable: 0, returnedStakes: 0, settledRounds: 0 });
      const a2 = second.connect('user-a');
      const b2 = second.connect('user-b');
      call(a2, 'bacc:join_room', { roomId });
      call(b2, 'bacc:join_room', { roomId });
      // The deal was completed from the stored shoe and is shown whole.
      const resumed = last<TableState>(b2, 'bacc:table_state')!;
      expect(resumed.roundNumber).toBe(1);
      expect(ranks(resumed.playerHand)).toEqual(['2', '3', '5']);
      expect(ranks(resumed.bankerHand)).toEqual(['K', '4', '3']);

      // The restored round pays 10 s after the restore, not before.
      await vi.advanceTimersByTimeAsync(9_000);
      expect(ledger.credits).toEqual([]);
      await vi.advanceTimersByTimeAsync(1_500);
      await flush();
      expect(last<RoundResult>(a2, 'bacc:round_result')).toEqual(expected);
      expect(balances()).toEqual(SETTLED);
      expect(ledger.credits.map((x) => [x.userId, x.amount, x.note])).toEqual(expectedCredits);
      expect(last<TableState>(a2, 'bacc:table_state')).toMatchObject({ phase: 'results', history: ['banker'] });

      // The table goes on: next betting phase, and the store follows it.
      await vi.advanceTimersByTimeAsync(6_000);
      await flush();
      expect(last<TableState>(a2, 'bacc:table_state')).toMatchObject({ phase: 'betting', roundNumber: 2 });
      expect(stored(store, roomId)).toMatchObject({ phase: 'betting', roundNumber: 2 });
    },
  );

  it('restarted during betting: the bets stay on their seats, the window reopens in full, and the round is dealt once', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    const { roomId } = await seatAndBet(first);
    const summary = await first.bacc.refundBaccaratOnShutdown();
    expect(summary).toMatchObject({ claims: 0, saved: 1 });
    expect(ledger.credits).toEqual([]);
    expect(stored(store, roomId)!.players.map(seatStake)).toEqual([20, 15]);

    ledger.shoe = WRONG_SHOE;
    const second = await boot(store);
    const a2 = second.connect('user-a');
    const b2 = second.connect('user-b');
    call(a2, 'bacc:join_room', { roomId });
    call(b2, 'bacc:join_room', { roomId });
    expect(last<TableState>(a2, 'bacc:table_state')).toMatchObject({ phase: 'betting', roundNumber: 1 });
    // A full window: still betting after 19 s, and a bet placed now joins the ones restored.
    await vi.advanceTimersByTimeAsync(19_000);
    await call(b2, 'bacc:place_bet', { type: 'player', amount: 5 });
    expect(last<TableState>(a2, 'bacc:table_state')!.phase).toBe('betting');
    await vi.advanceTimersByTimeAsync(1_000 + DEAL_MS + 100);
    await flush();
    // Dealt from the shoe the table was created with, not from one built after the restart.
    expect(ranks(last<RoundResult>(a2, 'bacc:round_result')!.bankerHand)).toEqual(['K', '4', '3']);
    expect(balances()).toEqual({ a: SETTLED.a, b: START - 20 });
    expect(ledger.debits.map((d) => [d.userId, d.amount])).toEqual([
      ['user-a', 20],
      ['user-b', 10],
      ['user-b', 5],
      ['user-b', 5],
    ]);
    expect(ledger.credits.map((x) => [x.userId, x.amount])).toEqual([['user-a', 40]]);
  });

  it('settles when nobody comes back: paid by user id, then the table leaves memory and the store', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    const { roomId } = await betAndDeal(first, 1_000);
    await first.bacc.refundBaccaratOnShutdown();

    const second = await boot(store);
    expect(second.bacc.listPublicRooms()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10_000 + 5_000 + 500);
    await flush();
    expect(balances()).toEqual(SETTLED);
    expect(second.bacc.listPublicRooms()).toEqual([]);
    expect(stored(store, roomId)).toBeNull();
    expect(store.entries.size).toBe(0);

    // And a third boot finds nothing to pay again.
    const third = await boot(store);
    expect(third.restored.restored).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ledger.credits).toHaveLength(1);
  });

  it('a restored seat nobody returns to outside a round leaves under the disconnect rule', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    const a = first.connect('user-a');
    const b = first.connect('user-b');
    call(a, 'bacc:create_room', { name: 'T' });
    const roomId = last<{ roomId: string }>(a, 'bacc:room_created')!.roomId;
    call(b, 'bacc:join_room', { roomId });
    await first.bacc.refundBaccaratOnShutdown(); // betting open, nobody has bet

    const second = await boot(store);
    const b2 = second.connect('user-b');
    call(b2, 'bacc:join_room', { roomId });
    // The empty window passes (20 s), 2 s later betting reopens; at 30 s A is still absent.
    await vi.advanceTimersByTimeAsync(30_500);
    await flush();
    expect(last<TableState>(b2, 'bacc:table_state')!.players.map((p) => p.userId)).toEqual(['user-b']);
    expect(balances()).toEqual({ a: START, b: START });
  });

  it('restarted during betting and nobody returns: the round is dealt once and the bets are settled by user id', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    const { roomId } = await seatAndBet(first);
    await first.bacc.refundBaccaratOnShutdown();

    await boot(store);
    // 20 s window, 4.8 s deal: the round is over before the 30 s reconnect clock fires; its bets are settled, not refunded.
    await vi.advanceTimersByTimeAsync(BETTING_MS + DEAL_MS + 500);
    await flush();
    expect(balances()).toEqual(SETTLED);
    expect(ledger.credits.map((x) => [x.userId, x.amount, x.note])).toEqual([['user-a', 40, 'Baccarat payout']]);
    await vi.advanceTimersByTimeAsync(40_000);
    await flush();
    expect(balances()).toEqual(SETTLED);
    expect(ledger.credits).toHaveLength(1);
    expect(stored(store, roomId)).toBeNull();
  });
});

describe('a save and a payment that race the restart', () => {
  it('saved while the settlement was in flight: the next process does not pay again', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    let release!: () => void;
    ledger.creditGate = new Promise<void>((r) => (release = r));
    const { roomId } = await betAndDeal(first, DEAL_MS + 100); // the payout transaction starts and waits on the ledger
    const shutdown = first.bacc.refundBaccaratOnShutdown();
    await flush();
    expect(stored(store, roomId)).toMatchObject({ phase: 'drawing', settling: true });
    release();
    ledger.creditGate = null;
    const summary = await shutdown;
    expect(summary).toMatchObject({ claims: 0, saved: 1 });
    expect(balances()).toEqual(SETTLED); // the old process paid

    const second = await boot(store);
    expect(second.restored.settledRounds).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(balances()).toEqual(SETTLED);
    expect(ledger.credits).toHaveLength(1);
  });

  it('saved while a settlement that then failed was in flight: the next process settles it, once, and counts the round once', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    let release!: () => void;
    ledger.creditGate = new Promise<void>((r) => (release = r));
    const { roomId } = await betAndDeal(first, DEAL_MS + 100);
    const shutdown = first.bacc.refundBaccaratOnShutdown();
    await flush();
    ledger.failNextCredit = true; // the old process's payout transaction is rejected
    release();
    ledger.creditGate = null;
    await shutdown;
    expect(balances()).toEqual({ a: START - 20, b: START - 15 });

    const second = await boot(store);
    expect(second.restored).toMatchObject({ restored: 1, settledRounds: 0 });
    const a2 = second.connect('user-a');
    call(a2, 'bacc:join_room', { roomId });
    await vi.advanceTimersByTimeAsync(10_500);
    await flush();
    expect(balances()).toEqual(SETTLED);
    expect(ledger.credits.map((x) => x.key)).toEqual([expect.stringMatching(/^bacc-payout:/)]);
    // History and statistics were counted by the first attempt and are not counted again.
    expect(last<TableState>(a2, 'bacc:table_state')).toMatchObject({ phase: 'results', history: ['banker'] });
    await vi.advanceTimersByTimeAsync(600);
    expect(stored(store, roomId)!.players[0].sessionStats).toEqual({ totalBet: 20, totalWon: 40, roundsPlayed: 1 });
  });

  it('restored from a save older than the payout (a crash): the paid round is neither paid nor played again', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    const { roomId } = await seatAndBet(first);
    const stale = store.entries.get(`baccarat:${roomId}`)!; // betting open, every bet on its seat
    expect(stored(store, roomId)!.players.map(seatStake)).toEqual([20, 15]);
    await vi.advanceTimersByTimeAsync(BETTING_MS + DEAL_MS + 100);
    await flush();
    expect(balances()).toEqual(SETTLED);

    // No shutdown: the process is gone and the store holds the older save.
    store.entries.set(`baccarat:${roomId}`, stale);
    const second = await boot(store);
    expect(second.restored).toEqual({ restored: 1, unreadable: 0, returnedStakes: 0, settledRounds: 1 });
    const b2 = second.connect('user-b');
    call(b2, 'bacc:join_room', { roomId });
    const table = last<TableState>(b2, 'bacc:table_state')!;
    expect(table.phase).toBe('idle');
    expect(table.players.map((p) => p.totalBetThisRound)).toEqual([0, 0]);
    // B leaves at once: nothing is on the seat to give back.
    call(b2, 'bacc:leave_room');
    await vi.advanceTimersByTimeAsync(120_000);
    await flush();
    expect(balances()).toEqual(SETTLED);
    expect(ledger.credits).toHaveLength(1);
  });

  it('the store rejects the shutdown save: every bet is refunded once, and a later restore of an older save pays nothing', async () => {
    const memory = new MemoryCasinoTableStore();
    let failing = false;
    const store: CasinoTableStore = {
      saveAll: (game, entries) => (failing ? Promise.reject(new Error('redis down')) : memory.saveAll(game, entries)),
      remove: (game, ids) => (failing ? Promise.reject(new Error('redis down')) : memory.remove(game, ids)),
      loadAll: (game) => memory.loadAll(game),
      close: () => memory.close(),
    };
    const first = await boot(store);
    const { roomId } = await betAndDeal(first, 1_000); // the coalesced save of the deal is in the store
    expect(stored(memory, roomId)!.phase).toBe('dealing');

    failing = true;
    const summary = await first.bacc.refundBaccaratOnShutdown();
    expect(summary).toMatchObject({ claims: 2, amount: 35, refunded: 2, failed: 0, unconfirmed: 0 });
    expect(summary.saved).toBeUndefined();
    expect(balances()).toEqual({ a: START, b: START });
    expect(ledger.credits.map((x) => x.key)).toEqual([
      expect.stringMatching(/^bacc-return:/),
      expect.stringMatching(/^bacc-return:/),
    ]);

    // Redis is back and still holds the older save: a banker win in the making, A's bet and all.
    failing = false;
    const second = await boot(store);
    expect(second.restored).toEqual({ restored: 1, unreadable: 0, returnedStakes: 2, settledRounds: 0 });
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(balances()).toEqual({ a: START, b: START });
    expect(ledger.credits).toHaveLength(2);
  });

  it('bets cleared, or returned when their player left, then a restore of a save taken before the refund: the bets are not on the seat', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    const { a, b, roomId } = await seatAndBet(first);
    const stale = store.entries.get(`baccarat:${roomId}`)!;
    await call(a, 'bacc:clear_bets');
    call(b, 'bacc:leave_room');
    await flush();
    expect(balances()).toEqual({ a: START, b: START });
    expect(ledger.credits.map((x) => [x.userId, x.amount, x.key?.split(':')[0]])).toEqual([
      ['user-a', 20, 'bacc-return'],
      ['user-b', 15, 'bacc-return'],
    ]);

    store.entries.set(`baccarat:${roomId}`, stale);
    const second = await boot(store);
    expect(second.restored.returnedStakes).toBe(2);
    const a2 = second.connect('user-a');
    call(a2, 'bacc:join_room', { roomId });
    expect(last<TableState>(a2, 'bacc:table_state')!.players.map((p) => p.totalBetThisRound)).toEqual([0, 0]);
    await vi.advanceTimersByTimeAsync(120_000);
    await flush();
    expect(balances()).toEqual({ a: START, b: START });
  });

  it('a second bet rides on the same stake: a save taken between the two is still seen as returned when both are cleared', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    const a = first.connect('user-a');
    call(a, 'bacc:create_room', { name: 'T' });
    const roomId = last<{ roomId: string }>(a, 'bacc:room_created')!.roomId;
    await call(a, 'bacc:place_bet', { type: 'banker', amount: 10 });
    await flush();
    const stale = store.entries.get(`baccarat:${roomId}`)!; // one bet of 10 on the seat
    await call(a, 'bacc:place_bet', { type: 'tie', amount: 5 });
    await call(a, 'bacc:clear_bets');
    await flush();
    expect(ledger.balances.get('user-a')).toBe(START);

    store.entries.set(`baccarat:${roomId}`, stale);
    const second = await boot(store);
    expect(second.restored).toMatchObject({ restored: 1, returnedStakes: 1 });
    await vi.advanceTimersByTimeAsync(120_000);
    await flush();
    expect(ledger.balances.get('user-a')).toBe(START);
    expect(ledger.credits).toHaveLength(1);
  });

  it('bets placed after a clear are a new stake: the earlier refund does not take them off the seat', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    const { a, roomId } = await seatAndBet(first);
    await call(a, 'bacc:clear_bets');
    await call(a, 'bacc:place_bet', { type: 'banker', amount: 15 });
    await flush();
    await first.bacc.refundBaccaratOnShutdown();

    const second = await boot(store);
    expect(second.restored).toMatchObject({ restored: 1, returnedStakes: 0 });
    expect(stored(store, roomId)!.players.map(seatStake)).toEqual([15, 15]);
    await vi.advanceTimersByTimeAsync(BETTING_MS + DEAL_MS + 500);
    await flush();
    expect(balances()).toEqual({ a: START - 15 + 30, b: START - 15 });
  });

  it('leaves an entry it cannot read in the store', async () => {
    const store = new MemoryCasinoTableStore();
    store.entries.set('baccarat:WRONG', JSON.stringify({ v: 999, roomId: 'WRONG' }));
    store.entries.set('baccarat:BROKEN', '{not json');
    const p = await boot(store);
    expect(p.restored).toEqual({ restored: 0, unreadable: 2, returnedStakes: 0, settledRounds: 0 });
    expect([...store.entries.keys()].sort()).toEqual(['baccarat:BROKEN', 'baccarat:WRONG']);
  });
});

describe('the stored table', () => {
  it('claims, for a table that was not saved, each seat with unsettled bets under its stake key', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    const { roomId } = await betAndDeal(first, 1_000);
    await first.bacc.refundBaccaratOnShutdown();
    const table = stored(store, roomId)!;
    const claims = unsavedTableClaims(table);
    expect(claims.map((c) => [c.userId, c.amount])).toEqual([
      ['user-a', 20],
      ['user-b', 15],
    ]);
    expect(claims.map((c) => c.idempotencyKey)).toEqual(table.players.map((p) => `bacc-return:${p.stakeId}`));
    expect(unsavedTableClaims({ ...table, phase: 'betting' })).toHaveLength(2);
    expect(unsavedTableClaims({ ...table, phase: 'drawing' })).toHaveLength(2);
    // A settlement in flight, a settled table and an idle one owe nothing through this path.
    expect(unsavedTableClaims({ ...table, settling: true })).toEqual([]);
    expect(unsavedTableClaims({ ...table, phase: 'results' })).toEqual([]);
    expect(unsavedTableClaims({ ...table, phase: 'idle' })).toEqual([]);
  });

  it('is not a table when it says the cards are out but a hand is short', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    const { roomId } = await betAndDeal(first, 1_000);
    await first.bacc.refundBaccaratOnShutdown();
    const raw = JSON.parse(store.entries.get(`baccarat:${roomId}`)!);
    expect(parseStoredBaccaratTable(raw)).not.toBeNull();
    expect(parseStoredBaccaratTable({ ...raw, bankerHand: raw.bankerHand.slice(0, 1) })).toBeNull();
  });
});

describe('the switch', () => {
  it('with the switch off a hub shutdown still refunds (the path is unchanged)', async () => {
    vi.resetModules();
    const bacc = await import('../baccarat');
    const world = makeWorld(bacc.registerBaccaratHandlers);
    bacc.initializeBaccarat(world.io);
    const a = world.connect('sock-a', { userId: 'user-a', userName: 'user-a' });
    call(a, 'bacc:create_room', { name: 'T' });
    await call(a, 'bacc:place_bet', { type: 'banker', amount: 10 });
    await call(a, 'bacc:clear_bets');
    await call(a, 'bacc:place_bet', { type: 'banker', amount: 10 });
    const summary = await bacc.refundBaccaratOnShutdown();
    expect(summary).toMatchObject({ claims: 1, amount: 10, refunded: 1 });
    expect(summary.saved).toBeUndefined();
    expect(ledger.credits).toEqual([
      { userId: 'user-a', amount: 10, note: 'Baccarat bet cleared', key: undefined },
      { userId: 'user-a', amount: 10, note: 'Baccarat stake refund (server restart)', key: expect.stringMatching(/^casino-shutdown:baccarat:/) },
    ]);
  });
});
