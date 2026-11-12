import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io';
import { makeWorld, last, type FakeSocket } from '../../../../server/socket-server/test-support/fake-world';
import { MemoryCasinoTableStore, openCasinoTableStore, type CasinoTableStore } from '../table-store';
import {
  parseStoredBlackjackTable,
  seatStake,
  unsavedTableClaims,
  type StoredBlackjackTable,
} from '../blackjack-table-state';

/**
 * Durable blackjack tables (third-pass audit OP3, `CASINO_DURABLE_TABLES=1`).
 *
 * A "process" here is one fresh import of `../blackjack` (`vi.resetModules()`
 * drops every module-level map), a fake socket.io world and fake timers. What
 * crosses the restart is what crosses a real one: the table store (an
 * in-memory `CasinoTableStore`, carried over) and the ledger (an in-memory
 * stand-in for `ledger-core` that honours idempotency keys the way the real
 * one does). The same flow against real Postgres, real Socket.IO and Redis is
 * `testing/integration/casino-restart.test.ts`.
 */

const ledger = vi.hoisted(() => ({
  balances: new Map<string, number>(),
  keys: new Set<string>(),
  credits: [] as Array<{ userId: string; amount: number; note?: string; key?: string }>,
  debits: [] as Array<{ userId: string; amount: number; note?: string }>,
  /** When set, every credit waits on it (a settlement transaction in flight). */
  creditGate: null as Promise<void> | null,
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
vi.mock('../../engine/blackjack/logic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../engine/blackjack/logic')>();
  return {
    ...actual,
    // drawCard pops from the end: the stacked ranks sit on top of 100 filler cards.
    createShoe: () => [
      ...Array.from({ length: 100 }, () => ({ suit: 'S', rank: '2' })),
      ...[...ledger.shoe].reverse().map((rank) => ({ suit: 'H', rank })),
    ],
  };
});

/**
 * A (seat 0) is dealt 10, 6; B (seat 1) 9, 2; the dealer 7 up, 10 down (17).
 * Then A hits a 5 (21, stands itself) and the next card is a 9.
 */
const SHOE = ['10', '6', '9', '2', '7', '10', '5', '9'];
/** What a shoe built after the restart would deal: if a restored round drew from it, the cards would show it. */
const WRONG_SHOE = ['K', 'K', 'K', 'K', 'K', 'K', 'K', 'K'];

const START = 1_000;

type Call = (payload?: unknown) => unknown;
const call = (s: FakeSocket, event: string, payload?: unknown) => (s.handlers.get(event) as unknown as Call)(payload);

/** Let queued microtasks (the mocked transactions, the store writes) run. */
async function flush() {
  for (let i = 0; i < 80; i++) await Promise.resolve();
}

interface TableStatePlayer {
  userId: string;
  hand: Array<{ rank: string }>;
  bet: number;
  status: string;
  payout: number;
}
interface TableState {
  phase: string;
  roundNumber: number;
  currentTurnUserId: string | null;
  dealerHand: Array<{ rank: string }>;
  players: TableStatePlayer[];
}

/** One hub process: fresh modules, a fresh socket world, durable tables on `store`. */
async function boot(store: CasinoTableStore) {
  vi.resetModules();
  const bj = await import('../blackjack');
  const world = makeWorld(bj.registerBlackjackHandlers);
  const restored = await bj.restoreBlackjackTables(world.io, store);
  bj.initializeBlackjackPublicTable(world.io);
  const connect = (userId: string, socketId = `${userId}-${Math.random().toString(36).slice(2, 8)}`) => {
    const s = world.connect(socketId, { userId, userName: userId });
    // The handlers read `connected` when they prune seats after a round.
    (s as unknown as { connected: boolean }).connected = true;
    return s;
  };
  const drop = (s: FakeSocket) => {
    world.disconnect(s);
    bj.handleBlackjackDisconnect(world.io, s as unknown as Socket);
  };
  return { bj, world, connect, drop, restored };
}

type Process = Awaited<ReturnType<typeof boot>>;

/** Seat A and B, bet 10 and 20, and play up to B's turn (A hit to 21). Returns the room id. */
async function playToBsTurn(p: Process) {
  const a = p.connect('user-a');
  const b = p.connect('user-b');
  call(a, 'bj:create_room', { name: 'T' });
  const roomId = last<{ roomId: string }>(a, 'bj:room_created')!.roomId;
  call(b, 'bj:join_room', { roomId });
  await call(a, 'bj:place_bet', { amount: 10 });
  await call(b, 'bj:place_bet', { amount: 20 }); // both bet: dealt at once
  call(a, 'bj:hit'); // 10 + 6 + 5 = 21: stands, B to act
  await flush();
  expect(last<TableState>(a, 'bj:table_state')).toMatchObject({ phase: 'player_turns', currentTurnUserId: 'user-b' });
  return { a, b, roomId };
}

/** From B's turn: B doubles, the dealer stands on 17, the round pays. Returns what the table said. */
async function finishWithBsDouble(b: FakeSocket, watcher: FakeSocket) {
  call(b, 'bj:double_down');
  await flush();
  await vi.advanceTimersByTimeAsync(2_000); // dealer reveal settle, then the payout
  await flush();
  return {
    results: last<{ results: Array<{ userId: string; result: string; payout: number; newBalance: number }> }>(
      watcher,
      'bj:round_results',
    ),
    table: last<TableState>(watcher, 'bj:table_state')!,
  };
}

function stored(store: MemoryCasinoTableStore, roomId: string): StoredBlackjackTable | null {
  const raw = store.entries.get(`blackjack:${roomId}`);
  return raw ? parseStoredBlackjackTable(JSON.parse(raw)) : null;
}

const balances = () => ({ a: ledger.balances.get('user-a'), b: ledger.balances.get('user-b') });

beforeEach(() => {
  vi.useFakeTimers();
  ledger.balances.clear();
  ledger.balances.set('user-a', START);
  ledger.balances.set('user-b', START);
  ledger.keys.clear();
  ledger.credits.length = 0;
  ledger.debits.length = 0;
  ledger.creditGate = null;
  ledger.shoe = SHOE;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a deploy during an open blackjack round', () => {
  it('settles the round to the same players, cards and balances as a round with no restart', async () => {
    // The round with no restart.
    const control = await boot(new MemoryCasinoTableStore());
    const c = await playToBsTurn(control);
    const expected = await finishWithBsDouble(c.b, c.a);
    const expectedBalances = balances();
    expect(expectedBalances).toEqual({ a: START - 10 + 20, b: START - 40 + 80 });

    // The same round, with the hub restarted at B's turn.
    ledger.balances.set('user-a', START).set('user-b', START);
    ledger.keys.clear();
    ledger.credits.length = 0;
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    const { roomId } = await playToBsTurn(first);

    const summary = await first.bj.refundBlackjackOnShutdown();
    expect(summary).toMatchObject({ claims: 0, refunded: 0, failed: 0, unconfirmed: 0, saved: 1 });
    expect(ledger.credits).toEqual([]); // saved, so nothing is refunded
    expect(balances()).toEqual({ a: START - 10, b: START - 20 });
    const atRest = stored(store, roomId)!;
    expect(atRest.phase).toBe('player_turns');
    expect(atRest.currentTurnUserId).toBe('user-b');
    expect(atRest.shoe.at(-1)).toEqual({ suit: 'H', rank: '9' }); // the next card to be drawn

    ledger.shoe = WRONG_SHOE;
    const second = await boot(store);
    expect(second.restored).toEqual({ restored: 1, unreadable: 0, returnedStakes: 0 });
    const a2 = second.connect('user-a');
    const b2 = second.connect('user-b');
    call(a2, 'bj:join_room', { roomId });
    call(b2, 'bj:join_room', { roomId });
    // Each gets the table as it was: same cards, same turn.
    const resumed = last<TableState>(b2, 'bj:table_state')!;
    expect(resumed).toMatchObject({ phase: 'player_turns', currentTurnUserId: 'user-b', roundNumber: 1 });
    expect(resumed.players.map((p) => p.hand.map((card) => card.rank))).toEqual([['10', '6', '5'], ['9', '2']]);

    const actual = await finishWithBsDouble(b2, a2);
    expect(actual.results).toEqual(expected.results);
    expect(actual.table.players.map((p) => p.hand)).toEqual(expected.table.players.map((p) => p.hand));
    expect(actual.table.dealerHand).toEqual(expected.table.dealerHand);
    expect(balances()).toEqual(expectedBalances);
    expect(ledger.credits.map((x) => [x.userId, x.amount])).toEqual([
      ['user-a', 20],
      ['user-b', 80],
    ]);

    // The table goes on: next betting phase, and the store follows it.
    await vi.advanceTimersByTimeAsync(6_000);
    await flush();
    expect(last<TableState>(a2, 'bj:table_state')).toMatchObject({ phase: 'betting', roundNumber: 2 });
    expect(stored(store, roomId)).toMatchObject({ phase: 'betting', roundNumber: 2 });
  });

  it('settles for a player who does not come back: the turn clock stands the hand and the seat is pruned', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    const { roomId } = await playToBsTurn(first);
    await first.bj.refundBlackjackOnShutdown();

    const second = await boot(store);
    const a2 = second.connect('user-a');
    call(a2, 'bj:join_room', { roomId });
    // B never reconnects. The restored turn clock is a full one.
    await vi.advanceTimersByTimeAsync(29_000);
    expect(last<TableState>(a2, 'bj:table_state')!.phase).toBe('player_turns');
    await vi.advanceTimersByTimeAsync(3_000); // B stands on 11; dealer 17; payout
    await flush();

    const results = last<{ results: Array<{ userId: string; result: string; payout: number }> }>(a2, 'bj:round_results')!;
    expect(results.results.map((r) => [r.userId, r.result, r.payout])).toEqual([
      ['user-a', 'win', 20],
      ['user-b', 'lose', 0],
    ]);
    // A: one bet, one payout. B: the stake it placed, lost at the table, not to the restart.
    expect(balances()).toEqual({ a: START - 10 + 20, b: START - 20 });
    expect(ledger.debits.map((d) => d.amount)).toEqual([10, 20]);
    expect(ledger.credits.map((x) => [x.userId, x.amount])).toEqual([['user-a', 20]]);

    await vi.advanceTimersByTimeAsync(6_000); // results shown, absent seat pruned
    await flush();
    expect(last<TableState>(a2, 'bj:table_state')!.players.map((p) => p.userId)).toEqual(['user-a']);
    expect(stored(store, roomId)!.players.map((p) => p.userId)).toEqual(['user-a']);
  });

  it('settles when nobody comes back, then removes the table from memory and from the store', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    const { roomId } = await playToBsTurn(first);
    await first.bj.refundBlackjackOnShutdown();

    const second = await boot(store);
    expect(second.bj.listPublicRooms()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(40_000);
    await flush();
    expect(balances()).toEqual({ a: START - 10 + 20, b: START - 20 });
    expect(second.bj.listPublicRooms()).toEqual([]);
    expect(stored(store, roomId)).toBeNull();
    expect(store.entries.size).toBe(0);

    // And a third boot finds nothing to pay again.
    const third = await boot(store);
    expect(third.restored.restored).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ledger.credits).toHaveLength(1);
  });

  it('keeps bets placed during betting; the window reopens in full and the round is dealt once', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    const a = first.connect('user-a');
    const b = first.connect('user-b');
    call(a, 'bj:create_room', { name: 'T' });
    const roomId = last<{ roomId: string }>(a, 'bj:room_created')!.roomId;
    call(b, 'bj:join_room', { roomId });
    await call(a, 'bj:place_bet', { amount: 10 });
    await first.bj.refundBlackjackOnShutdown();
    expect(ledger.credits).toEqual([]);

    const second = await boot(store);
    const a2 = second.connect('user-a');
    const b2 = second.connect('user-b');
    call(a2, 'bj:join_room', { roomId });
    call(b2, 'bj:join_room', { roomId });
    expect(last<TableState>(a2, 'bj:table_state')).toMatchObject({ phase: 'betting', roundNumber: 1 });
    // A's bet is on the seat: a second one is refused, and nothing is debited for it.
    await call(a2, 'bj:place_bet', { amount: 10 });
    expect(last<{ message: string }>(a2, 'bj:error')!.message).toMatch(/already placed/);
    await call(b2, 'bj:place_bet', { amount: 20 });
    await flush();
    expect(last<TableState>(a2, 'bj:table_state')!.phase).toBe('player_turns');
    expect(ledger.debits.map((d) => [d.userId, d.amount])).toEqual([
      ['user-a', 10],
      ['user-b', 20],
    ]);
  });

  it('a restored seat nobody returns to during betting leaves under the disconnect rule: its bet is refunded once', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    const a = first.connect('user-a');
    const b = first.connect('user-b');
    call(a, 'bj:create_room', { name: 'T' });
    const roomId = last<{ roomId: string }>(a, 'bj:room_created')!.roomId;
    call(b, 'bj:join_room', { roomId });
    await first.bj.refundBlackjackOnShutdown(); // betting open, nobody has bet

    const second = await boot(store);
    const b2 = second.connect('user-b');
    call(b2, 'bj:join_room', { roomId });
    // Two empty betting windows pass (15 s, 2 s, 15 s); B bets in the second, at 20 s.
    await vi.advanceTimersByTimeAsync(20_000);
    await call(b2, 'bj:place_bet', { amount: 20 });
    // 30 s after the restore A is still absent and no round is in progress: A's seat leaves.
    await vi.advanceTimersByTimeAsync(10_500);
    await flush();
    const table = last<TableState>(b2, 'bj:table_state')!;
    expect(table.players.map((p) => p.userId)).toEqual(['user-b']);
    expect(ledger.credits.filter((x) => x.userId === 'user-a')).toEqual([]); // A had staked nothing
    expect(balances().a).toBe(START);
  });
});

describe('a save and a payment that race the restart', () => {
  it('saved while the settlement was in flight: the next process settles again and each stake is paid once', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    const { b, roomId } = await playToBsTurn(first);
    call(b, 'bj:double_down');
    await flush();

    let release!: () => void;
    ledger.creditGate = new Promise<void>((r) => (release = r));
    await vi.advanceTimersByTimeAsync(1_000); // the payout transaction starts and waits on the ledger
    const shutdown = first.bj.refundBlackjackOnShutdown();
    await flush();
    expect(stored(store, roomId)!.phase).toBe('payout');
    release();
    ledger.creditGate = null;
    await shutdown;
    expect(balances()).toEqual({ a: START - 10 + 20, b: START - 40 + 80 }); // the old process paid

    await boot(store);
    await vi.advanceTimersByTimeAsync(12_000); // the restored settlement runs
    await flush();
    expect(balances()).toEqual({ a: START - 10 + 20, b: START - 40 + 80 });
    expect(ledger.credits).toHaveLength(2);
  });

  it('restored from a save older than the payout (a crash): the round plays again and pays nothing twice', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    const { a, b, roomId } = await playToBsTurn(first);
    await vi.advanceTimersByTimeAsync(600); // the coalesced save
    const stale = store.entries.get(`blackjack:${roomId}`)!;
    await finishWithBsDouble(b, a);
    expect(balances()).toEqual({ a: START - 10 + 20, b: START - 40 + 80 });

    // No shutdown: the process is gone and the store holds the older save.
    store.entries.set(`blackjack:${roomId}`, stale);
    await boot(store);
    await vi.advanceTimersByTimeAsync(40_000); // nobody returns; the stale round plays out
    await flush();
    expect(balances()).toEqual({ a: START - 10 + 20, b: START - 40 + 80 });
    expect(ledger.credits).toHaveLength(2);
  });

  it('the store rejects the shutdown save: every stake is refunded once, and a later restore of an older save pays nothing', async () => {
    const memory = new MemoryCasinoTableStore();
    let failing = false;
    const store: CasinoTableStore = {
      saveAll: (game, entries) => (failing ? Promise.reject(new Error('redis down')) : memory.saveAll(game, entries)),
      remove: (game, ids) => (failing ? Promise.reject(new Error('redis down')) : memory.remove(game, ids)),
      loadAll: (game) => memory.loadAll(game),
      close: () => memory.close(),
    };
    const first = await boot(store);
    const { roomId } = await playToBsTurn(first);
    await vi.advanceTimersByTimeAsync(600); // an earlier coalesced save is in the store
    expect(stored(memory, roomId)!.phase).toBe('player_turns');

    failing = true;
    const summary = await first.bj.refundBlackjackOnShutdown();
    expect(summary).toMatchObject({ claims: 2, amount: 30, refunded: 2, failed: 0, unconfirmed: 0 });
    expect(balances()).toEqual({ a: START, b: START });
    expect(ledger.credits.map((x) => x.key)).toEqual([
      expect.stringMatching(/^bj-return:/),
      expect.stringMatching(/^bj-return:/),
    ]);

    // Redis is back and still holds the older save, stakes and all.
    failing = false;
    const second = await boot(store);
    expect(second.restored).toEqual({ restored: 1, unreadable: 0, returnedStakes: 2 });
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(balances()).toEqual({ a: START, b: START });
    expect(ledger.credits).toHaveLength(2);
  });

  it('a bet returned when its player left, then a restore of a save taken before the refund: the bet is not on the seat', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    const a = first.connect('user-a');
    const b = first.connect('user-b');
    call(a, 'bj:create_room', { name: 'T' });
    const roomId = last<{ roomId: string }>(a, 'bj:room_created')!.roomId;
    call(b, 'bj:join_room', { roomId });
    await call(a, 'bj:place_bet', { amount: 10 });
    await flush();
    const stale = store.entries.get(`blackjack:${roomId}`)!;
    expect(stored(store, roomId)!.players[0]).toMatchObject({ userId: 'user-a', bet: 10 });
    call(a, 'bj:leave_room');
    await flush();
    expect(balances().a).toBe(START);

    store.entries.set(`blackjack:${roomId}`, stale);
    const second = await boot(store);
    expect(second.restored.returnedStakes).toBe(1);
    const b2 = second.connect('user-b');
    call(b2, 'bj:join_room', { roomId });
    const seatA = last<TableState>(b2, 'bj:table_state')!.players.find((p) => p.userId === 'user-a')!;
    expect(seatA).toMatchObject({ bet: 0, status: 'waiting' });
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(balances().a).toBe(START);
  });

  it('leaves an entry it cannot read in the store', async () => {
    const store = new MemoryCasinoTableStore();
    store.entries.set('blackjack:WRONG', JSON.stringify({ v: 999, roomId: 'WRONG' }));
    store.entries.set('blackjack:BROKEN', '{not json');
    const p = await boot(store);
    expect(p.restored).toEqual({ restored: 0, unreadable: 2, returnedStakes: 0 });
    expect([...store.entries.keys()].sort()).toEqual(['blackjack:BROKEN', 'blackjack:WRONG']);
  });
});

describe('the stored table', () => {
  it('claims, for a table that was not saved, each unsettled seat stake under its stake key', async () => {
    const store = new MemoryCasinoTableStore();
    const first = await boot(store);
    const { roomId } = await playToBsTurn(first);
    await first.bj.refundBlackjackOnShutdown();
    const table = stored(store, roomId)!;
    expect(table.players.map(seatStake)).toEqual([10, 20]);
    const claims = unsavedTableClaims(table);
    expect(claims.map((c) => [c.userId, c.amount])).toEqual([
      ['user-a', 10],
      ['user-b', 20],
    ]);
    expect(claims.map((c) => c.idempotencyKey)).toEqual(table.players.map((p) => `bj-return:${p.stakeId}`));
    // Settled or in-settlement tables owe nothing through this path.
    expect(unsavedTableClaims({ ...table, phase: 'payout' })).toEqual([]);
    expect(unsavedTableClaims({ ...table, phase: 'results' })).toEqual([]);
  });
});

describe('the switch', () => {
  const log = { info: vi.fn(), warn: vi.fn() };

  it('is off unless CASINO_DURABLE_TABLES=1: no store, nothing logged', async () => {
    expect(await openCasinoTableStore(log, {})).toBeNull();
    expect(await openCasinoTableStore(log, { REDIS_STATE_URL: 'redis://127.0.0.1:1' })).toBeNull();
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('needs REDIS_STATE_URL: the cache-plane REDIS_URL is never used', async () => {
    expect(await openCasinoTableStore(log, { CASINO_DURABLE_TABLES: '1', REDIS_URL: 'redis://127.0.0.1:1' })).toBeNull();
    expect(log.info).toHaveBeenCalledWith({ event: 'casino_durable_tables_disabled', reason: 'REDIS_STATE_URL unset' });
  });

  it('with the switch off a hub shutdown still refunds (the path is unchanged)', async () => {
    vi.resetModules();
    const bj = await import('../blackjack');
    const world = makeWorld(bj.registerBlackjackHandlers);
    bj.initializeBlackjackPublicTable(world.io);
    const a = world.connect('sock-a', { userId: 'user-a', userName: 'user-a' });
    call(a, 'bj:create_room', { name: 'T' });
    await call(a, 'bj:place_bet', { amount: 10 });
    const summary = await bj.refundBlackjackOnShutdown();
    expect(summary).toMatchObject({ claims: 1, amount: 10, refunded: 1 });
    expect(summary.saved).toBeUndefined();
    expect(ledger.credits).toEqual([
      { userId: 'user-a', amount: 10, note: 'Blackjack stake refund (server restart)', key: expect.stringMatching(/^casino-shutdown:blackjack:/) },
    ]);
    expect(ledger.debits).toEqual([{ userId: 'user-a', amount: 10, note: 'Blackjack bet' }]);
  });
});
