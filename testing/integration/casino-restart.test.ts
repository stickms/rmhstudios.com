/**
 * A deploy during an open blackjack round, and during a baccarat deal
 * (third-pass audit OP3, done-when).
 *
 * Unlike the other files here this one does not go through the web app. It
 * runs the socket hub's casino tier inside the test process, twice: a real
 * Socket.IO server on a real port, real `socket.io-client` players, the hub's
 * own Prisma client and `ledger-core` on the suite's Postgres, and the durable
 * table store. Between the two it does what a deploy does to the hub:
 *
 *   process 1  restoreCasinoTables → listen → players sit, bet and act
 *              → the shutdown sequence of `server/socket-server/index.ts`
 *                (CASINO_SHUTDOWN_REFUNDS, io.close(), close the store, close Prisma)
 *   process 2  fresh modules (every in-memory table is gone)
 *              → restoreCasinoTables → listen → the same users reconnect
 *
 * The store is Redis when `INTEGRATION_REDIS_STATE_URL` is set (CI sets it;
 * each process opens its own connection, as two hub processes would) and
 * otherwise one in-memory `CasinoTableStore` carried across. The describe
 * title says which one ran.
 *
 * Not covered here: the hub's session middleware (a test middleware reads the
 * user id from the handshake), the OS signal, and the process exit. The shoes
 * are stacked so the restarted round can be compared, card for card and coin
 * for coin, with the same round played without a restart.
 *
 * The baccarat case runs on the hub's real clocks (a 20 s betting window, a
 * 10 s wait before a restored deal pays), so it takes about 45 s.
 */
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Server } from 'socket.io';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import { closeDb, db } from './lib/client';
import type { CasinoTableStore } from '../../features/casino/server/table-store';

const REDIS_URL = process.env.INTEGRATION_REDIS_STATE_URL;
const BACKING = REDIS_URL ? 'Redis' : 'in-memory store';

/**
 * A (seat 0) is dealt 10, 6; B (seat 1) 9, 2; the dealer 7 up, 10 down (17).
 * A hits a 5 (21). B doubles and draws a 9 (20). Both beat the dealer.
 */
const shoe = vi.hoisted(() => ({ ranks: ['10', '6', '9', '2', '7', '10', '5', '9'] }));
vi.mock('../../features/casino/engine/blackjack/logic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/casino/engine/blackjack/logic')>();
  return {
    ...actual,
    // The table draws from the end: the stacked ranks sit on top of 100 filler cards.
    createShoe: () => [
      ...Array.from({ length: 100 }, () => ({ suit: 'S', rank: '2' })),
      ...[...shoe.ranks].reverse().map((rank) => ({ suit: 'H', rank })),
    ],
  };
});

/**
 * Baccarat: player 2, 3 (five: draws); banker K, 4 (four). The player draws a
 * 5 (zero); the banker, on four against a 5, draws a 3 (seven). Banker wins.
 */
const baccShoe = vi.hoisted(() => ({ ranks: ['2', 'K', '3', '4', '5', '3'] }));
vi.mock('../../features/casino/engine/baccarat/logic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/casino/engine/baccarat/logic')>();
  return {
    ...actual,
    createShoe: () => [
      ...Array.from({ length: 100 }, () => ({ suit: 'S', rank: '9' })),
      ...[...baccShoe.ranks].reverse().map((rank) => ({ suit: 'H', rank })),
    ],
  };
});

const START = 1_000;

interface TableState {
  phase: string;
  roundNumber: number;
  currentTurnUserId: string | null;
  dealerHand: Array<{ suit: string; rank: string }>;
  players: Array<{ userId: string; hand: Array<{ suit: string; rank: string }>; bet: number; status: string }>;
}
interface RoundResults {
  results: Array<{ userId: string; result: string; payout: number; insurancePayout: number; newBalance: number }>;
  dealerValue: number;
}

// ─── One hub process ─────────────────────────────────────────────

interface Hub {
  url: string;
  /** What `shutdown()` in server/socket-server/index.ts does for the casino, in its order. */
  stop(): Promise<unknown[]>;
}

async function startHub(memoryStore: CasinoTableStore | null): Promise<Hub> {
  vi.resetModules(); // a new process: no table, seat or timer survives in memory
  const casino = await import('../../features/casino/server');
  const { openCasinoTableStore } = await import('../../features/casino/server/table-store');
  const { disconnectPrisma } = await import('../../server/socket-server/prisma-client');
  const { logger } = await import('../../server/socket-server/logger');

  const http: HttpServer = createServer();
  const io = new Server(http, { path: '/socket/' });
  // Stands in for softAuthMiddleware: the hub's handlers only read socket.data.
  io.use((socket, next) => {
    socket.data.userId = socket.handshake.auth.userId;
    socket.data.userName = socket.handshake.auth.userName;
    next();
  });
  io.on('connection', (socket) => {
    casino.default.register(io, socket);
    socket.on('disconnect', () => casino.default.onDisconnect?.(io, socket));
  });

  let store = memoryStore;
  if (REDIS_URL) {
    store = await openCasinoTableStore(logger, { CASINO_DURABLE_TABLES: '1', REDIS_STATE_URL: REDIS_URL });
    if (!store) throw new Error(`INTEGRATION_REDIS_STATE_URL is set but Redis at ${REDIS_URL} is not reachable`);
  }
  // Restore before listen, as the hub does.
  await casino.restoreCasinoTables(io, store!);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  casino.initializeCasino(io);

  return {
    url: `http://127.0.0.1:${(http.address() as AddressInfo).port}`,
    async stop() {
      const refunds = casino.CASINO_SHUTDOWN_REFUNDS.map(([, run]) => run(casino.CASINO_SHUTDOWN_DEADLINE_MS));
      await new Promise<void>((resolve) => io.close(() => resolve()));
      const summaries = await Promise.all(refunds);
      await casino.closeCasinoTableStore();
      await disconnectPrisma();
      return summaries;
    },
  };
}

// ─── Players ─────────────────────────────────────────────────────

const clients: ClientSocket[] = [];

async function player(hub: Hub, userId: string): Promise<ClientSocket> {
  const socket = connectClient(hub.url, {
    path: '/socket/',
    transports: ['websocket'],
    reconnection: false,
    auth: { userId, userName: userId.slice(0, 12) },
  });
  clients.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}

/** The next `event` whose payload satisfies `match` (default: any). */
function next<T>(socket: ClientSocket, event: string, match: (payload: T) => boolean = () => true, ms = 20_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, on);
      reject(new Error(`no ${event} within ${ms} ms`));
    }, ms);
    const on = (payload: T) => {
      if (!match(payload)) return;
      clearTimeout(timer);
      socket.off(event, on);
      resolve(payload);
    };
    socket.on(event, on);
  });
}

async function seedUser(label: string): Promise<string> {
  const id = `it-bj-${label}-${randomUUID()}`;
  await db().query('insert into "user" (id, name, "updatedAt") values ($1, $2, now())', [id, `Integ ${label}`]);
  await db().query('insert into user_profile (id, "userId", coins, "updatedAt") values ($1, $2, $3, now())', [
    `it-profile-${id}`,
    id,
    START,
  ]);
  return id;
}

async function coins(userId: string): Promise<number> {
  const { rows } = await db().query('select coins from user_profile where "userId" = $1', [userId]);
  return Number(rows[0].coins);
}

/** The user's ledger rows, oldest first, as signed amounts with their notes. */
async function ledger(userId: string): Promise<Array<[number, string]>> {
  const { rows } = await db().query(
    `select case when "senderId" = $1 then -amount else amount end as delta, note
       from coin_transaction where "senderId" = $1 or "recipientId" = $1 order by "createdAt", id`,
    [userId],
  );
  return rows.map((r) => [Number(r.delta), String(r.note)]);
}

/** A creates a table, B joins, they bet 10 and 20, A hits to 21. Ends on B's turn. */
async function playToBsTurn(hub: Hub, aId: string, bId: string) {
  const a = await player(hub, aId);
  const b = await player(hub, bId);
  const created = next<{ roomId: string }>(a, 'bj:room_created');
  a.emit('bj:create_room', { name: 'Restart', privacy: 'unlisted' });
  const { roomId } = await created;
  const joined = next(b, 'bj:room_joined');
  b.emit('bj:join_room', { roomId });
  await joined;

  const aBet = next(a, 'bj:balance_update');
  a.emit('bj:place_bet', { amount: 10 });
  await aBet;
  const dealt = next<TableState>(a, 'bj:table_state', (s) => s.phase === 'player_turns' && s.currentTurnUserId === aId);
  b.emit('bj:place_bet', { amount: 20 });
  await dealt;
  const bsTurn = next<TableState>(a, 'bj:table_state', (s) => s.currentTurnUserId === bId);
  a.emit('bj:hit');
  return { a, b, roomId, table: await bsTurn };
}

async function leave(socket: ClientSocket, game: 'bj' | 'bacc' = 'bj'): Promise<void> {
  const left = next(socket, `${game}:room_left`);
  socket.emit(`${game}:leave_room`);
  await left;
}

/** Results with the user ids replaced by seat letters, so two rounds with different users compare. */
function bySeat(results: RoundResults, aId: string, bId: string) {
  return {
    dealerValue: results.dealerValue,
    results: results.results.map((r) => ({ ...r, userId: r.userId === aId ? 'A' : r.userId === bId ? 'B' : r.userId })),
  };
}

afterAll(async () => {
  for (const c of clients) c.disconnect();
  await closeDb();
});

describe(`a deploy during an open blackjack round (table store: ${BACKING})`, () => {
  it('settles the round to the same players after the restart, with the cards and balances of a round with no restart', async () => {
    const [aId, bId, cId, dId] = await Promise.all(['a', 'b', 'c', 'd'].map(seedUser));
    const { MemoryCasinoTableStore } = await import('../../features/casino/server/table-store');
    const memory = REDIS_URL ? null : new MemoryCasinoTableStore();

    // ── Process 1 ──
    const first = await startHub(memory);

    // The round with no restart, on its own table (users C and D).
    const control = await playToBsTurn(first, cId, dId);
    const controlResults = next<RoundResults>(control.a, 'bj:round_results');
    const controlFinal = next<TableState>(control.a, 'bj:table_state', (s) => s.phase === 'results');
    control.b.emit('bj:double_down');
    const expected = bySeat(await controlResults, cId, dId);
    const expectedTable = await controlFinal;
    expect(expected.results.map((r) => [r.userId, r.result, r.payout])).toEqual([
      ['A', 'win', 20],
      ['B', 'win', 80],
    ]);
    expect(await coins(cId)).toBe(START - 10 + 20);
    expect(await coins(dId)).toBe(START - 40 + 80);
    control.a.emit('bj:leave_room');
    control.b.emit('bj:leave_room');

    // The round the deploy lands on (users A and B), stopped on B's turn.
    const open = await playToBsTurn(first, aId, bId);
    expect(await coins(aId)).toBe(START - 10);
    expect(await coins(bId)).toBe(START - 20);

    const summaries = (await first.stop()) as Array<{ game: string; claims: number; saved?: number }>;
    const blackjack = summaries.find((s) => s.game === 'blackjack')!;
    expect(blackjack.claims).toBe(0); // saved, not refunded
    expect(blackjack.saved).toBeGreaterThanOrEqual(1);
    expect(await coins(aId)).toBe(START - 10);
    expect(await coins(bId)).toBe(START - 20);

    // ── Process 2 ──
    shoe.ranks = ['K', 'K', 'K', 'K', 'K', 'K', 'K', 'K']; // a shoe built now would deal these
    const second = await startHub(memory);
    const a2 = await player(second, aId);
    const b2 = await player(second, bId);
    const aBack = next<TableState>(a2, 'bj:table_state');
    a2.emit('bj:join_room', { roomId: open.roomId });
    const resumed = await aBack;
    expect(resumed).toMatchObject({ phase: 'player_turns', currentTurnUserId: bId, roundNumber: 1 });
    expect(resumed.players.map((p) => [p.userId, p.hand.map((c) => c.rank)])).toEqual([
      [aId, ['10', '6', '5']],
      [bId, ['9', '2']],
    ]);
    expect(resumed.players).toEqual(open.table.players); // seat for seat what the old process last sent
    const bBack = next(b2, 'bj:room_joined');
    b2.emit('bj:join_room', { roomId: open.roomId });
    await bBack;

    const results = next<RoundResults>(a2, 'bj:round_results');
    const final = next<TableState>(a2, 'bj:table_state', (s) => s.phase === 'results');
    b2.emit('bj:double_down');
    const settled = bySeat(await results, aId, bId);
    const finalTable = await final;

    expect(settled).toEqual(expected);
    expect(finalTable.dealerHand).toEqual(expectedTable.dealerHand);
    expect(finalTable.players.map((p) => p.hand)).toEqual(expectedTable.players.map((p) => p.hand));
    expect(await coins(aId)).toBe(await coins(cId));
    expect(await coins(bId)).toBe(await coins(dId));
    // Exactly the rows a round with no restart writes: nothing refunded, nothing paid twice.
    expect(await ledger(aId)).toEqual(await ledger(cId));
    expect(await ledger(bId)).toEqual(await ledger(dId));
    expect(await ledger(bId)).toEqual([
      [-20, 'Blackjack bet'],
      [-20, 'Blackjack double down'],
      [80, 'Blackjack payout'],
    ]);

    // Leave between rounds, so the table is destroyed and its entry leaves the store.
    await next<TableState>(a2, 'bj:table_state', (t) => t.phase === 'betting');
    await leave(a2);
    await leave(b2);
    await second.stop();
  }, 60_000);

  it('pays a player who does not come back: a round waiting on the dealer settles by user id', async () => {
    const [aId, bId] = await Promise.all(['e', 'f'].map(seedUser));
    const { MemoryCasinoTableStore } = await import('../../features/casino/server/table-store');
    const memory = REDIS_URL ? null : new MemoryCasinoTableStore();
    shoe.ranks = ['10', '6', '9', '2', '7', '10', '5', '9'];

    const first = await startHub(memory);
    const open = await playToBsTurn(first, aId, bId);
    const dealerTurn = next<TableState>(open.a, 'bj:table_state', (s) => s.phase === 'dealer_turn');
    open.b.emit('bj:double_down');
    await dealerTurn; // every hand is played; the payout is under a second away
    await first.stop();
    expect(await coins(aId)).toBe(START - 10);
    expect(await coins(bId)).toBe(START - 40);

    const second = await startHub(memory);
    const a2 = await player(second, aId); // B does not reconnect
    const results = next<RoundResults>(a2, 'bj:round_results');
    a2.emit('bj:join_room', { roomId: open.roomId });
    const settled = await results; // the restored payout runs 10 s after the restore

    expect(settled.results.map((r) => [r.userId, r.result, r.payout])).toEqual([
      [aId, 'win', 20],
      [bId, 'win', 80],
    ]);
    expect(await coins(aId)).toBe(START - 10 + 20);
    expect(await coins(bId)).toBe(START - 40 + 80);
    expect(await ledger(bId)).toEqual([
      [-20, 'Blackjack bet'],
      [-20, 'Blackjack double down'],
      [80, 'Blackjack payout'],
    ]);

    // B's seat is pruned once the results have been shown; A's stays.
    const pruned = await next<TableState>(a2, 'bj:table_state', (s) => s.phase === 'betting');
    expect(pruned.players.map((p) => p.userId)).toEqual([aId]);

    await leave(a2);
    await second.stop();
  }, 60_000);
});

// ─── Baccarat ────────────────────────────────────────────────────

interface BaccTableState {
  phase: string;
  roundNumber: number;
  playerHand: Array<{ suit: string; rank: string }>;
  bankerHand: Array<{ suit: string; rank: string }>;
  players: Array<{ userId: string; totalBetThisRound: number; lastPayout: number }>;
}
interface BaccRoundResult {
  result: string;
  playerHand: Array<{ suit: string; rank: string }>;
  bankerHand: Array<{ suit: string; rank: string }>;
  playerValue: number;
  bankerValue: number;
}

/** A creates a table, B joins. A puts 20 on banker, B 10 on player and 5 on the tie. Betting stays open. */
async function seatAndBetBaccarat(hub: Hub, aId: string, bId: string) {
  const a = await player(hub, aId);
  const b = await player(hub, bId);
  const created = next<{ roomId: string }>(a, 'bacc:room_created');
  a.emit('bacc:create_room', { name: 'Restart', privacy: 'unlisted' });
  const { roomId } = await created;
  const joined = next(b, 'bacc:room_joined');
  b.emit('bacc:join_room', { roomId });
  await joined;
  for (const [socket, type, amount] of [
    [a, 'banker', 20],
    [b, 'player', 10],
    [b, 'tie', 5],
  ] as const) {
    const debited = next(socket, 'bacc:balance_update');
    socket.emit('bacc:place_bet', { type, amount });
    await debited;
  }
  return { a, b, roomId };
}

describe(`a deploy during a baccarat deal (table store: ${BACKING})`, () => {
  it('completes the deal from the stored shoe and pays the same hands, to a player who returns and one who does not', async () => {
    const [aId, bId, cId, dId] = await Promise.all(['ba', 'bb', 'bc', 'bd'].map(seedUser));
    const { MemoryCasinoTableStore } = await import('../../features/casino/server/table-store');
    const memory = REDIS_URL ? null : new MemoryCasinoTableStore();

    // ── Process 1 ──
    const first = await startHub(memory);

    // The round with no restart (users C and D). Its betting window closes 6 s before the other table's.
    const control = await seatAndBetBaccarat(first, cId, dId);
    const controlResult = next<BaccRoundResult>(control.a, 'bacc:round_result', () => true, 40_000);
    const controlSettled = next<BaccTableState>(control.a, 'bacc:table_state', (s) => s.phase === 'results', 40_000);
    await new Promise((resolve) => setTimeout(resolve, 6_000));

    // The round the deploy lands on (users A and B).
    const open = await seatAndBetBaccarat(first, aId, bId);
    const dealing = next<BaccTableState>(open.a, 'bacc:table_state', (s) => s.phase === 'dealing', 40_000);

    const expected = await controlResult;
    await controlSettled;
    expect(expected).toMatchObject({ result: 'banker', playerValue: 0, bankerValue: 7 });
    expect(expected.bankerHand.map((c) => c.rank)).toEqual(['K', '4', '3']);
    expect(await coins(cId)).toBe(START - 20 + 40);
    expect(await coins(dId)).toBe(START - 15);
    // They leave while the results show: their seats wait for the sweep, which the deploy cuts off.
    await leave(control.a, 'bacc');
    await leave(control.b, 'bacc');

    // The deploy: the first four cards are drawn, no third card yet, nothing paid.
    await dealing;
    const summaries = (await first.stop()) as Array<{ game: string; claims: number; saved?: number }>;
    const baccarat = summaries.find((s) => s.game === 'baccarat')!;
    expect(baccarat.claims).toBe(0); // saved, not refunded
    expect(baccarat.saved).toBeGreaterThanOrEqual(1);
    expect(await coins(aId)).toBe(START - 20);
    expect(await coins(bId)).toBe(START - 15);

    // ── Process 2 ──
    baccShoe.ranks = ['9', '9', '9', '9', '9', '9']; // a shoe built now would deal these
    const second = await startHub(memory);
    const a2 = await player(second, aId); // B does not reconnect
    const aBack = next<BaccTableState>(a2, 'bacc:table_state');
    const result = next<BaccRoundResult>(a2, 'bacc:round_result', () => true, 30_000);
    a2.emit('bacc:join_room', { roomId: open.roomId });
    const resumed = await aBack;
    expect(resumed.roundNumber).toBe(1);
    expect(resumed.playerHand.map((c) => c.rank)).toEqual(['2', '3', '5']);
    expect(resumed.bankerHand.map((c) => c.rank)).toEqual(['K', '4', '3']);
    expect(resumed.players.map((p) => [p.userId, p.totalBetThisRound])).toEqual([
      [aId, 20],
      [bId, 15],
    ]);

    expect(await result).toEqual(expected); // the restored deal pays 10 s after the restore
    await next<BaccTableState>(a2, 'bacc:table_state', (s) => s.phase === 'results');
    expect(await coins(aId)).toBe(await coins(cId));
    expect(await coins(bId)).toBe(await coins(dId));
    // Exactly the rows a round with no restart writes: nothing refunded, nothing paid twice.
    expect(await ledger(aId)).toEqual(await ledger(cId));
    expect(await ledger(bId)).toEqual(await ledger(dId));
    expect(await ledger(aId)).toEqual([
      [-20, 'Baccarat bet'],
      [40, 'Baccarat payout'],
    ]);

    // B's seat is pruned once the results have been shown; A's stays. A leaves, so the entry leaves the store.
    const pruned = await next<BaccTableState>(a2, 'bacc:table_state', (s) => s.phase === 'betting');
    expect(pruned.players.map((p) => p.userId)).toEqual([aId]);
    await leave(a2, 'bacc');
    // The other table came back with both seats already gone, and was removed at the restore.
    expect((await import('../../features/casino/server')).listCasinoRooms().baccarat).toEqual([]);
    await second.stop();
  }, 120_000);
});
