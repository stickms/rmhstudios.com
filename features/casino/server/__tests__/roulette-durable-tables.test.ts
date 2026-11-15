import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { Socket } from 'socket.io';
import {
  makeWorld,
  last,
  type FakeSocket,
} from '../../../../server/socket-server/test-support/fake-world';
import {
  MemoryCasinoTableStore,
  type CasinoTableStore,
} from '../table-store';
import {
  parseStoredRouletteTable,
  seatStake,
  unsavedTableClaims,
  type StoredRouletteTable,
} from '../roulette-table-state';
import { getOutsideBetNumbers } from '../../engine/roulette/logic';

/**
 * Durable roulette tables (third-pass audit OP3, `CASINO_DURABLE_TABLES=1`).
 *
 * Same method as `blackjack-durable-tables.test.ts`: a "process" is one fresh
 * import of `../roulette`, a fake socket.io world and fake timers. What crosses
 * the restart is the table store (in-memory, carried over) and the ledger (an
 * in-memory stand-in for `ledger-core` that honours idempotency keys). The
 * same flow against real Postgres, real Socket.IO and Redis is
 * `testing/integration/casino-restart.test.ts`.
 */

const ledger =
  vi.hoisted(
    () => ({
      balances:
        new Map<
          string,
          number
        >(),
      keys: new Set<string>(),
      credits:
        [] as Array<{
          userId: string;
          amount: number;
          note?: string;
          key?: string;
        }>,
      debits:
        [] as Array<{
          userId: string;
          amount: number;
          note?: string;
        }>,
      /** When set, every credit waits on it (a settlement transaction in flight). */
      creditGate:
        null as Promise<void> | null,
      /** When set, the next credit throws once (a refund the database rejected). */
      failNextCredit: false,
      /** The number the wheel lands on. */
      spin: 7,
      spins: 0,
    }),
  );

vi.mock(
  '../../../../server/socket-server/prisma-client',
  () => ({
    getPrismaClient:
      () => ({
        $transaction:
          async (
            fn: (
              tx: unknown,
            ) => unknown,
          ) =>
            fn(
              {},
            ),
        coinTransaction:
          {
            findMany:
              async ({
                where,
              }: {
                where: {
                  idempotencyKey: {
                    in: string[];
                  };
                };
              }) =>
                where.idempotencyKey.in
                  .filter(
                    (
                      k,
                    ) =>
                      ledger.keys.has(
                        k,
                      ),
                  )
                  .map(
                    (
                      k,
                    ) => ({
                      idempotencyKey:
                        k,
                    }),
                  ),
          },
      }),
  }),
);
vi.mock(
  '../../../../lib/economy/ledger-core',
  () => ({
    debitCoinsOn:
      async (
        _c: unknown,
        userId: string,
        amount: number,
        opts: {
          note?: string;
        },
      ) => {
        const have =
          ledger.balances.get(
            userId,
          ) ??
          0;
        if (
          have <
          amount
        )
          throw new Error(
            'INSUFFICIENT_COINS',
          );
        ledger.balances.set(
          userId,
          have -
            amount,
        );
        ledger.debits.push(
          {
            userId,
            amount,
            note: opts.note,
          },
        );
      },
    creditCoinsOn:
      async (
        _c: unknown,
        userId: string,
        amount: number,
        opts: {
          note?: string;
          idempotencyKey?: string;
        },
      ) => {
        if (
          ledger.creditGate
        )
          await ledger.creditGate;
        if (
          ledger.failNextCredit
        ) {
          ledger.failNextCredit = false;
          throw new Error(
            'database down',
          );
        }
        if (
          opts.idempotencyKey
        ) {
          if (
            ledger.keys.has(
              opts.idempotencyKey,
            )
          )
            return {
              applied: false,
              replayed: true,
              transactionId:
                'x',
            };
          ledger.keys.add(
            opts.idempotencyKey,
          );
        }
        ledger.balances.set(
          userId,
          (ledger.balances.get(
            userId,
          ) ??
            0) +
            amount,
        );
        ledger.credits.push(
          {
            userId,
            amount,
            note: opts.note,
            key: opts.idempotencyKey,
          },
        );
        return {
          applied: true,
          replayed: false,
          transactionId:
            'x',
        };
      },
    getBalanceOn:
      async (
        _c: unknown,
        userId: string,
      ) =>
        ledger.balances.get(
          userId,
        ) ??
        0,
    getBalancesOn:
      async (
        _c: unknown,
        ids: string[],
      ) =>
        new Map(
          ids.map(
            (
              id,
            ) => [
              id,
              ledger.balances.get(
                id,
              ) ??
                0,
            ],
          ),
        ),
  }),
);
vi.mock(
  '../../../../server/socket-server/rate-limit',
  () => ({
    checkRateLimit:
      () =>
        true,
  }),
);
vi.mock(
  '../../../../server/socket-server/logger',
  () => ({
    logger:
      {
        info: vi.fn(),
        warn: vi.fn(),
        error:
          vi.fn(),
      },
  }),
);
vi.mock(
  '../../engine/roulette/logic',
  async (
    importOriginal,
  ) => {
    const actual =
      await importOriginal<
        typeof import('../../engine/roulette/logic')
      >();
    return {
      ...actual,
      spin: () => {
        ledger.spins++;
        return ledger.spin;
      },
    };
  },
);

const START = 1_000;
const RED =
  {
    type: 'red',
    numbers:
      getOutsideBetNumbers(
        'red',
      ),
  };
const BLACK =
  {
    type: 'black',
    numbers:
      getOutsideBetNumbers(
        'black',
      ),
  };
const SEVEN =
  {
    type: 'straight',
    numbers:
      [
        7,
      ],
  };

type Call =
  (
    payload?: unknown,
  ) => unknown;
const call =
  (
    s: FakeSocket,
    event: string,
    payload?: unknown,
  ) =>
    (
      s.handlers.get(
        event,
      ) as unknown as Call
    )(
      payload,
    );

/** Let queued microtasks (the mocked transactions, the store writes) run. */
async function flush() {
  for (
    let i = 0;
    i <
    80;
    i++
  )
    await Promise.resolve();
}

interface TableState {
  phase: string;
  roundNumber: number;
  lastResult:
    | number
    | null;
  history: number[];
  players: Array<{
    userId: string;
    bets: Array<{
      type: string;
      amount: number;
    }>;
    totalBetThisRound: number;
    lastPayout: number;
  }>;
}
interface RoundResult {
  result: number;
  payouts: Array<{
    userId: string;
    payout: number;
    netGain: number;
  }>;
}

/** One hub process: fresh modules, a fresh socket world, durable tables on `store`. */
async function boot(
  store: CasinoTableStore,
) {
  vi.resetModules();
  const rl =
    await import('../roulette');
  const world =
    makeWorld(
      rl.registerRouletteHandlers,
    );
  const restored =
    await rl.restoreRouletteTables(
      world.io,
      store,
    );
  rl.initializeRoulette(
    world.io,
  );
  const connect =
    (
      userId: string,
    ) => {
      const s =
        world.connect(
          `${userId}-${Math.random().toString(36).slice(2, 8)}`,
          {
            userId,
            userName:
              userId,
          },
        );
      // The handlers read `connected` when they prune seats after a round.
      (
        s as unknown as {
          connected: boolean;
        }
      ).connected =
        true;
      return s;
    };
  const drop =
    (
      s: FakeSocket,
    ) => {
      world.disconnect(
        s,
      );
      rl.handleRouletteDisconnect(
        world.io,
        s as unknown as Socket,
      );
    };
  return {
    rl,
    world,
    connect,
    drop,
    restored,
  };
}

type Process =
  Awaited<
    ReturnType<
      typeof boot
    >
  >;

/** Seat A and B. A puts 10 on 7 and 20 on red, B 20 on black. Betting is still open. */
async function seatAndBet(
  p: Process,
) {
  const a =
    p.connect(
      'user-a',
    );
  const b =
    p.connect(
      'user-b',
    );
  call(
    a,
    'rl:create_room',
    {
      name: 'T',
    },
  );
  const roomId =
    last<{
      roomId: string;
    }>(
      a,
      'rl:room_created',
    )!.roomId;
  call(
    b,
    'rl:join_room',
    {
      roomId,
    },
  );
  await call(
    a,
    'rl:place_bet',
    {
      ...SEVEN,
      amount: 10,
    },
  );
  await call(
    a,
    'rl:place_bet',
    {
      ...RED,
      amount: 20,
    },
  );
  await call(
    b,
    'rl:place_bet',
    {
      ...BLACK,
      amount: 20,
    },
  );
  await flush();
  return {
    a,
    b,
    roomId,
  };
}

/** The same, then the betting window closes and the wheel lands (on `ledger.spin`). */
async function betAndSpin(
  p: Process,
) {
  const seats =
    await seatAndBet(
      p,
    );
  await vi.advanceTimersByTimeAsync(
    25_000,
  );
  await flush();
  expect(
    last<TableState>(
      seats.a,
      'rl:table_state',
    ),
  ).toMatchObject(
    {
      phase:
        'spinning',
      lastResult:
        ledger.spin,
    },
  );
  return seats;
}

function stored(
  store: MemoryCasinoTableStore,
  roomId: string,
): StoredRouletteTable | null {
  const raw =
    store.entries.get(
      `roulette:${roomId}`,
    );
  return raw
    ? parseStoredRouletteTable(
        JSON.parse(
          raw,
        ),
      )
    : null;
}

const balances =
  () => ({
    a: ledger.balances.get(
      'user-a',
    ),
    b: ledger.balances.get(
      'user-b',
    ),
  });
/** 7 is red: the straight pays 10 + 350, red pays 20 + 20, black loses. */
const SETTLED =
  {
    a:
      START -
      30 +
      400,
    b:
      START -
      20,
  };

function resetLedger() {
  ledger.balances.clear();
  ledger.balances.set(
    'user-a',
    START,
  );
  ledger.balances.set(
    'user-b',
    START,
  );
  ledger.keys.clear();
  ledger.credits.length = 0;
  ledger.debits.length = 0;
  ledger.creditGate =
    null;
  ledger.failNextCredit = false;
  ledger.spin = 7;
  ledger.spins = 0;
}

beforeEach(
  () => {
    vi.useFakeTimers();
    resetLedger();
  },
);
afterEach(
  () => {
    vi.useRealTimers();
  },
);

describe('a deploy during an open roulette round', () => {
  it('restarted while the wheel spins: pays the stored number to the same seats and balances as a round with no restart', async () => {
    // The round with no restart.
    const control =
      await boot(
        new MemoryCasinoTableStore(),
      );
    const c =
      await betAndSpin(
        control,
      );
    await vi.advanceTimersByTimeAsync(
      5_000,
    );
    await flush();
    const expected =
      last<RoundResult>(
        c.a,
        'rl:round_result',
      )!;
    expect(
      expected.payouts,
    ).toEqual(
      [
        {
          userId:
            'user-a',
          payout: 400,
          netGain: 370,
        },
        {
          userId:
            'user-b',
          payout: 0,
          netGain:
            -20,
        },
      ],
    );
    expect(
      balances(),
    ).toEqual(
      SETTLED,
    );
    const expectedCredits =
      ledger.credits.map(
        (
          x,
        ) => [
          x.userId,
          x.amount,
          x.note,
        ],
      );

    // The same round, with the hub restarted while the wheel spins.
    resetLedger();
    const store =
      new MemoryCasinoTableStore();
    const first =
      await boot(
        store,
      );
    const {
      roomId,
    } =
      await betAndSpin(
        first,
      );
    const summary =
      await first.rl.refundRouletteOnShutdown();
    expect(
      summary,
    ).toMatchObject(
      {
        claims: 0,
        refunded: 0,
        failed: 0,
        unconfirmed: 0,
        saved: 1,
      },
    );
    expect(
      ledger.credits,
    ).toEqual(
      [],
    ); // saved, so nothing is refunded
    expect(
      balances(),
    ).toEqual(
      {
        a:
          START -
          30,
        b:
          START -
          20,
      },
    );
    expect(
      stored(
        store,
        roomId,
      ),
    ).toMatchObject(
      {
        phase:
          'spinning',
        settling: false,
        lastResult: 7,
      },
    );

    ledger.spin = 22; // a wheel spun again after the restart would land here (black)
    const second =
      await boot(
        store,
      );
    expect(
      second.restored,
    ).toEqual(
      {
        restored: 1,
        unreadable: 0,
        returnedStakes: 0,
        settledRounds: 0,
      },
    );
    const a2 =
      second.connect(
        'user-a',
      );
    const b2 =
      second.connect(
        'user-b',
      );
    call(
      a2,
      'rl:join_room',
      {
        roomId,
      },
    );
    call(
      b2,
      'rl:join_room',
      {
        roomId,
      },
    );
    const resumed =
      last<TableState>(
        b2,
        'rl:table_state',
      )!;
    expect(
      resumed,
    ).toMatchObject(
      {
        phase:
          'spinning',
        roundNumber: 1,
        lastResult: 7,
      },
    );
    expect(
      resumed.players.map(
        (
          p,
        ) =>
          p.totalBetThisRound,
      ),
    ).toEqual(
      [
        30,
        20,
      ],
    );

    // The restored spin pays 10 s after the restore, not before.
    await vi.advanceTimersByTimeAsync(
      9_000,
    );
    expect(
      ledger.credits,
    ).toEqual(
      [],
    );
    await vi.advanceTimersByTimeAsync(
      1_500,
    );
    await flush();
    expect(
      last<RoundResult>(
        a2,
        'rl:round_result',
      ),
    ).toEqual(
      expected,
    );
    expect(
      ledger.spins,
    ).toBe(
      1,
    ); // the wheel was not spun again
    expect(
      balances(),
    ).toEqual(
      SETTLED,
    );
    expect(
      ledger.credits.map(
        (
          x,
        ) => [
          x.userId,
          x.amount,
          x.note,
        ],
      ),
    ).toEqual(
      expectedCredits,
    );
    expect(
      last<TableState>(
        a2,
        'rl:table_state',
      ),
    ).toMatchObject(
      {
        phase:
          'results',
        history:
          [
            7,
          ],
      },
    );

    // The table goes on: next betting phase, and the store follows it.
    await vi.advanceTimersByTimeAsync(
      9_000,
    );
    await flush();
    expect(
      last<TableState>(
        a2,
        'rl:table_state',
      ),
    ).toMatchObject(
      {
        phase:
          'betting',
        roundNumber: 2,
      },
    );
    expect(
      stored(
        store,
        roomId,
      ),
    ).toMatchObject(
      {
        phase:
          'betting',
        roundNumber: 2,
      },
    );
  });

  it('restarted during betting: the bets stay on their seats, the window reopens in full, and the round spins once', async () => {
    const store =
      new MemoryCasinoTableStore();
    const first =
      await boot(
        store,
      );
    const {
      roomId,
    } =
      await seatAndBet(
        first,
      );
    const summary =
      await first.rl.refundRouletteOnShutdown();
    expect(
      summary,
    ).toMatchObject(
      {
        claims: 0,
        saved: 1,
      },
    );
    expect(
      ledger.credits,
    ).toEqual(
      [],
    );
    expect(
      stored(
        store,
        roomId,
      )!.players.map(
        seatStake,
      ),
    ).toEqual(
      [
        30,
        20,
      ],
    );

    const second =
      await boot(
        store,
      );
    const a2 =
      second.connect(
        'user-a',
      );
    const b2 =
      second.connect(
        'user-b',
      );
    call(
      a2,
      'rl:join_room',
      {
        roomId,
      },
    );
    call(
      b2,
      'rl:join_room',
      {
        roomId,
      },
    );
    expect(
      last<TableState>(
        a2,
        'rl:table_state',
      ),
    ).toMatchObject(
      {
        phase:
          'betting',
        roundNumber: 1,
      },
    );
    // A full window: still betting after 24 s, and a bet placed now joins the ones restored.
    await vi.advanceTimersByTimeAsync(
      24_000,
    );
    await call(
      b2,
      'rl:place_bet',
      {
        ...BLACK,
        amount: 5,
      },
    );
    expect(
      last<TableState>(
        a2,
        'rl:table_state',
      )!
        .phase,
    ).toBe(
      'betting',
    );
    await vi.advanceTimersByTimeAsync(
      1_000 +
        5_000,
    );
    await flush();
    expect(
      ledger.spins,
    ).toBe(
      1,
    );
    expect(
      balances(),
    ).toEqual(
      {
        a: SETTLED.a,
        b:
          START -
          25,
      },
    );
    expect(
      ledger.debits.map(
        (
          d,
        ) => [
          d.userId,
          d.amount,
        ],
      ),
    ).toEqual(
      [
        [
          'user-a',
          10,
        ],
        [
          'user-a',
          20,
        ],
        [
          'user-b',
          20,
        ],
        [
          'user-b',
          5,
        ],
      ],
    );
    expect(
      ledger.credits.map(
        (
          x,
        ) => [
          x.userId,
          x.amount,
        ],
      ),
    ).toEqual(
      [
        [
          'user-a',
          400,
        ],
      ],
    );
  });

  it('settles when nobody comes back: paid by user id, then the table leaves memory and the store', async () => {
    const store =
      new MemoryCasinoTableStore();
    const first =
      await boot(
        store,
      );
    const {
      roomId,
    } =
      await betAndSpin(
        first,
      );
    await first.rl.refundRouletteOnShutdown();

    const second =
      await boot(
        store,
      );
    expect(
      second.rl.listPublicRooms(),
    ).toHaveLength(
      1,
    );
    await vi.advanceTimersByTimeAsync(
      10_000 +
        8_000 +
        500,
    );
    await flush();
    expect(
      balances(),
    ).toEqual(
      SETTLED,
    );
    expect(
      second.rl.listPublicRooms(),
    ).toEqual(
      [],
    );
    expect(
      stored(
        store,
        roomId,
      ),
    ).toBeNull();
    expect(
      store
        .entries
        .size,
    ).toBe(
      0,
    );

    // And a third boot finds nothing to pay again.
    const third =
      await boot(
        store,
      );
    expect(
      third
        .restored
        .restored,
    ).toBe(
      0,
    );
    await vi.advanceTimersByTimeAsync(
      60_000,
    );
    expect(
      ledger.credits,
    ).toHaveLength(
      1,
    );
  });

  it('a restored seat nobody returns to outside a round leaves under the disconnect rule', async () => {
    const store =
      new MemoryCasinoTableStore();
    const first =
      await boot(
        store,
      );
    const a =
      first.connect(
        'user-a',
      );
    const b =
      first.connect(
        'user-b',
      );
    call(
      a,
      'rl:create_room',
      {
        name: 'T',
      },
    );
    const roomId =
      last<{
        roomId: string;
      }>(
        a,
        'rl:room_created',
      )!.roomId;
    call(
      b,
      'rl:join_room',
      {
        roomId,
      },
    );
    await first.rl.refundRouletteOnShutdown(); // betting open, nobody has bet

    const second =
      await boot(
        store,
      );
    const b2 =
      second.connect(
        'user-b',
      );
    call(
      b2,
      'rl:join_room',
      {
        roomId,
      },
    );
    // The empty window passes (25 s), 2 s later betting reopens; at 30 s A is still absent.
    await vi.advanceTimersByTimeAsync(
      30_500,
    );
    await flush();
    expect(
      last<TableState>(
        b2,
        'rl:table_state',
      )!.players.map(
        (
          p,
        ) =>
          p.userId,
      ),
    ).toEqual(
      [
        'user-b',
      ],
    );
    expect(
      balances(),
    ).toEqual(
      {
        a: START,
        b: START,
      },
    );
  });

  it('restarted during betting and nobody returns: the window closes, the wheel spins once and the bets are settled by user id', async () => {
    const store =
      new MemoryCasinoTableStore();
    const first =
      await boot(
        store,
      );
    const {
      roomId,
    } =
      await seatAndBet(
        first,
      );
    await first.rl.refundRouletteOnShutdown();

    await boot(
      store,
    );
    // 25 s window, 5 s spin: the round is in progress when the 30 s reconnect clock fires, so no seat is refunded.
    await vi.advanceTimersByTimeAsync(
      25_000 +
        5_000 +
        500,
    );
    await flush();
    expect(
      ledger.spins,
    ).toBe(
      1,
    );
    expect(
      balances(),
    ).toEqual(
      SETTLED,
    );
    expect(
      ledger.credits.map(
        (
          x,
        ) => [
          x.userId,
          x.amount,
          x.note,
        ],
      ),
    ).toEqual(
      [
        [
          'user-a',
          400,
          'Roulette payout',
        ],
      ],
    );
    await vi.advanceTimersByTimeAsync(
      8_500,
    );
    expect(
      stored(
        store,
        roomId,
      ),
    ).toBeNull();
  });
});

describe('a save and a payment that race the restart', () => {
  it('saved while the settlement was in flight: the next process does not pay again', async () => {
    const store =
      new MemoryCasinoTableStore();
    const first =
      await boot(
        store,
      );
    const {
      roomId,
    } =
      await betAndSpin(
        first,
      );

    let release!: () => void;
    ledger.creditGate =
      new Promise<void>(
        (
          r,
        ) =>
          (release =
            r),
      );
    await vi.advanceTimersByTimeAsync(
      5_000,
    ); // the payout transaction starts and waits on the ledger
    const shutdown =
      first.rl.refundRouletteOnShutdown();
    await flush();
    expect(
      stored(
        store,
        roomId,
      ),
    ).toMatchObject(
      {
        phase:
          'spinning',
        settling: true,
      },
    );
    release();
    ledger.creditGate =
      null;
    const summary =
      await shutdown;
    expect(
      summary,
    ).toMatchObject(
      {
        claims: 0,
        saved: 1,
      },
    );
    expect(
      balances(),
    ).toEqual(
      SETTLED,
    ); // the old process paid

    const second =
      await boot(
        store,
      );
    expect(
      second
        .restored
        .settledRounds,
    ).toBe(
      1,
    );
    await vi.advanceTimersByTimeAsync(
      60_000,
    );
    await flush();
    expect(
      balances(),
    ).toEqual(
      SETTLED,
    );
    expect(
      ledger.credits,
    ).toHaveLength(
      1,
    );
  });

  it('saved while a settlement that then failed was in flight: the next process settles it, once, and counts the round once', async () => {
    const store =
      new MemoryCasinoTableStore();
    const first =
      await boot(
        store,
      );
    const {
      roomId,
    } =
      await betAndSpin(
        first,
      );

    let release!: () => void;
    ledger.creditGate =
      new Promise<void>(
        (
          r,
        ) =>
          (release =
            r),
      );
    await vi.advanceTimersByTimeAsync(
      5_000,
    );
    const shutdown =
      first.rl.refundRouletteOnShutdown();
    await flush();
    ledger.failNextCredit = true; // the old process's payout transaction is rejected
    release();
    ledger.creditGate =
      null;
    await shutdown;
    expect(
      balances(),
    ).toEqual(
      {
        a:
          START -
          30,
        b:
          START -
          20,
      },
    );

    const second =
      await boot(
        store,
      );
    expect(
      second.restored,
    ).toMatchObject(
      {
        restored: 1,
        settledRounds: 0,
      },
    );
    const a2 =
      second.connect(
        'user-a',
      );
    call(
      a2,
      'rl:join_room',
      {
        roomId,
      },
    );
    await vi.advanceTimersByTimeAsync(
      10_500,
    );
    await flush();
    expect(
      balances(),
    ).toEqual(
      SETTLED,
    );
    expect(
      ledger.credits.map(
        (
          x,
        ) =>
          x.key,
      ),
    ).toEqual(
      [
        expect.stringMatching(
          /^rl-payout:/,
        ),
      ],
    );
    // History and statistics were counted by the first attempt and are not counted again.
    expect(
      last<TableState>(
        a2,
        'rl:table_state',
      ),
    ).toMatchObject(
      {
        phase:
          'results',
        history:
          [
            7,
          ],
      },
    );
    expect(
      stored(
        store,
        roomId,
      ) ??
        null,
    ).not.toBeNull();
    await vi.advanceTimersByTimeAsync(
      600,
    );
    expect(
      stored(
        store,
        roomId,
      )!
        .players[0]
        .sessionStats,
    ).toEqual(
      {
        totalBet: 30,
        totalWon: 400,
        roundsPlayed: 1,
      },
    );
  });

  it('restored from a save older than the payout (a crash): the paid round is neither paid nor played again', async () => {
    const store =
      new MemoryCasinoTableStore();
    const first =
      await boot(
        store,
      );
    const {
      roomId,
    } =
      await seatAndBet(
        first,
      );
    const stale =
      store.entries.get(
        `roulette:${roomId}`,
      )!; // betting open, every bet on its seat
    expect(
      stored(
        store,
        roomId,
      )!.players.map(
        seatStake,
      ),
    ).toEqual(
      [
        30,
        20,
      ],
    );
    await vi.advanceTimersByTimeAsync(
      25_000 +
        5_000,
    );
    await flush();
    expect(
      balances(),
    ).toEqual(
      SETTLED,
    );

    // No shutdown: the process is gone and the store holds the older save.
    store.entries.set(
      `roulette:${roomId}`,
      stale,
    );
    ledger.spin = 22; // black: if the stored betting round were spun again, B would be paid
    const second =
      await boot(
        store,
      );
    expect(
      second.restored,
    ).toEqual(
      {
        restored: 1,
        unreadable: 0,
        returnedStakes: 0,
        settledRounds: 1,
      },
    );
    const b2 =
      second.connect(
        'user-b',
      );
    call(
      b2,
      'rl:join_room',
      {
        roomId,
      },
    );
    const table =
      last<TableState>(
        b2,
        'rl:table_state',
      )!;
    expect(
      table.phase,
    ).toBe(
      'idle',
    );
    expect(
      table.players.map(
        (
          p,
        ) =>
          p.totalBetThisRound,
      ),
    ).toEqual(
      [
        0,
        0,
      ],
    );
    // B leaves at once: nothing is on the seat to give back.
    call(
      b2,
      'rl:leave_room',
    );
    await vi.advanceTimersByTimeAsync(
      120_000,
    );
    await flush();
    expect(
      balances(),
    ).toEqual(
      SETTLED,
    );
    expect(
      ledger.credits,
    ).toHaveLength(
      1,
    );
    expect(
      ledger.spins,
    ).toBe(
      1,
    );
  });

  it('the store rejects the shutdown save: every bet is refunded once, and a later restore of an older save pays nothing', async () => {
    const memory =
      new MemoryCasinoTableStore();
    let failing = false;
    const store: CasinoTableStore =
      {
        saveAll:
          (
            game,
            entries,
          ) =>
            failing
              ? Promise.reject(
                  new Error(
                    'redis down',
                  ),
                )
              : memory.saveAll(
                  game,
                  entries,
                ),
        remove:
          (
            game,
            ids,
          ) =>
            failing
              ? Promise.reject(
                  new Error(
                    'redis down',
                  ),
                )
              : memory.remove(
                  game,
                  ids,
                ),
        loadAll:
          (
            game,
          ) =>
            memory.loadAll(
              game,
            ),
        close:
          () =>
            memory.close(),
      };
    const first =
      await boot(
        store,
      );
    const {
      roomId,
    } =
      await betAndSpin(
        first,
      );
    await vi.advanceTimersByTimeAsync(
      600,
    ); // an earlier coalesced save is in the store
    expect(
      stored(
        memory,
        roomId,
      )!
        .phase,
    ).toBe(
      'spinning',
    );

    failing = true;
    const summary =
      await first.rl.refundRouletteOnShutdown();
    expect(
      summary,
    ).toMatchObject(
      {
        claims: 2,
        amount: 50,
        refunded: 2,
        failed: 0,
        unconfirmed: 0,
      },
    );
    expect(
      summary.saved,
    ).toBeUndefined();
    expect(
      balances(),
    ).toEqual(
      {
        a: START,
        b: START,
      },
    );
    expect(
      ledger.credits.map(
        (
          x,
        ) =>
          x.key,
      ),
    ).toEqual(
      [
        expect.stringMatching(
          /^rl-return:/,
        ),
        expect.stringMatching(
          /^rl-return:/,
        ),
      ],
    );

    // Redis is back and still holds the older save: the spin landed on 7, A's bets and all.
    failing = false;
    const second =
      await boot(
        store,
      );
    expect(
      second.restored,
    ).toEqual(
      {
        restored: 1,
        unreadable: 0,
        returnedStakes: 2,
        settledRounds: 0,
      },
    );
    await vi.advanceTimersByTimeAsync(
      60_000,
    );
    await flush();
    expect(
      balances(),
    ).toEqual(
      {
        a: START,
        b: START,
      },
    );
    expect(
      ledger.credits,
    ).toHaveLength(
      2,
    );
  });

  it('bets cleared, or returned when their player left, then a restore of a save taken before the refund: the bets are not on the seat', async () => {
    const store =
      new MemoryCasinoTableStore();
    const first =
      await boot(
        store,
      );
    const {
      a,
      b,
      roomId,
    } =
      await seatAndBet(
        first,
      );
    const stale =
      store.entries.get(
        `roulette:${roomId}`,
      )!;
    await call(
      a,
      'rl:clear_bets',
    );
    call(
      b,
      'rl:leave_room',
    );
    await flush();
    expect(
      balances(),
    ).toEqual(
      {
        a: START,
        b: START,
      },
    );
    expect(
      ledger.credits.map(
        (
          x,
        ) => [
          x.userId,
          x.amount,
          x.key?.split(
            ':',
          )[0],
        ],
      ),
    ).toEqual(
      [
        [
          'user-a',
          30,
          'rl-return',
        ],
        [
          'user-b',
          20,
          'rl-return',
        ],
      ],
    );

    store.entries.set(
      `roulette:${roomId}`,
      stale,
    );
    const second =
      await boot(
        store,
      );
    expect(
      second
        .restored
        .returnedStakes,
    ).toBe(
      2,
    );
    const a2 =
      second.connect(
        'user-a',
      );
    call(
      a2,
      'rl:join_room',
      {
        roomId,
      },
    );
    expect(
      last<TableState>(
        a2,
        'rl:table_state',
      )!.players.map(
        (
          p,
        ) =>
          p.totalBetThisRound,
      ),
    ).toEqual(
      [
        0,
        0,
      ],
    );
    await vi.advanceTimersByTimeAsync(
      120_000,
    );
    await flush();
    expect(
      balances(),
    ).toEqual(
      {
        a: START,
        b: START,
      },
    );
    expect(
      ledger.spins,
    ).toBe(
      0,
    );
  });

  it('a second bet rides on the same stake: a save taken between the two is still seen as returned when both are cleared', async () => {
    const store =
      new MemoryCasinoTableStore();
    const first =
      await boot(
        store,
      );
    const a =
      first.connect(
        'user-a',
      );
    call(
      a,
      'rl:create_room',
      {
        name: 'T',
      },
    );
    const roomId =
      last<{
        roomId: string;
      }>(
        a,
        'rl:room_created',
      )!.roomId;
    await call(
      a,
      'rl:place_bet',
      {
        ...RED,
        amount: 10,
      },
    );
    await flush();
    const stale =
      store.entries.get(
        `roulette:${roomId}`,
      )!; // one bet of 10 on the seat
    await call(
      a,
      'rl:place_bet',
      {
        ...BLACK,
        amount: 5,
      },
    );
    await call(
      a,
      'rl:clear_bets',
    );
    await flush();
    expect(
      ledger.balances.get(
        'user-a',
      ),
    ).toBe(
      START,
    );

    store.entries.set(
      `roulette:${roomId}`,
      stale,
    );
    const second =
      await boot(
        store,
      );
    expect(
      second.restored,
    ).toMatchObject(
      {
        restored: 1,
        returnedStakes: 1,
      },
    );
    await vi.advanceTimersByTimeAsync(
      120_000,
    );
    await flush();
    expect(
      ledger.balances.get(
        'user-a',
      ),
    ).toBe(
      START,
    );
    expect(
      ledger.credits,
    ).toHaveLength(
      1,
    );
  });

  it('bets placed after a clear are a new stake: the earlier refund does not take them off the seat', async () => {
    const store =
      new MemoryCasinoTableStore();
    const first =
      await boot(
        store,
      );
    const {
      a,
      roomId,
    } =
      await seatAndBet(
        first,
      );
    await call(
      a,
      'rl:clear_bets',
    );
    await call(
      a,
      'rl:place_bet',
      {
        ...RED,
        amount: 15,
      },
    );
    await flush();
    await first.rl.refundRouletteOnShutdown();

    const second =
      await boot(
        store,
      );
    expect(
      second.restored,
    ).toMatchObject(
      {
        restored: 1,
        returnedStakes: 0,
      },
    );
    expect(
      stored(
        store,
        roomId,
      )!.players.map(
        seatStake,
      ),
    ).toEqual(
      [
        15,
        20,
      ],
    );
    await vi.advanceTimersByTimeAsync(
      25_000 +
        10_000 +
        500,
    );
    await flush();
    expect(
      balances(),
    ).toEqual(
      {
        a:
          START -
          15 +
          30,
        b:
          START -
          20,
      },
    );
  });

  it('leaves an entry it cannot read in the store', async () => {
    const store =
      new MemoryCasinoTableStore();
    store.entries.set(
      'roulette:WRONG',
      JSON.stringify(
        {
          v: 999,
          roomId:
            'WRONG',
        },
      ),
    );
    store.entries.set(
      'roulette:BROKEN',
      '{not json',
    );
    const p =
      await boot(
        store,
      );
    expect(
      p.restored,
    ).toEqual(
      {
        restored: 0,
        unreadable: 2,
        returnedStakes: 0,
        settledRounds: 0,
      },
    );
    expect(
      [
        ...store.entries.keys(),
      ].sort(),
    ).toEqual(
      [
        'roulette:BROKEN',
        'roulette:WRONG',
      ],
    );
  });
});

describe('the stored table', () => {
  it('claims, for a table that was not saved, each seat with unsettled bets under its stake key', async () => {
    const store =
      new MemoryCasinoTableStore();
    const first =
      await boot(
        store,
      );
    const {
      roomId,
    } =
      await betAndSpin(
        first,
      );
    await first.rl.refundRouletteOnShutdown();
    const table =
      stored(
        store,
        roomId,
      )!;
    const claims =
      unsavedTableClaims(
        table,
      );
    expect(
      claims.map(
        (
          c,
        ) => [
          c.userId,
          c.amount,
        ],
      ),
    ).toEqual(
      [
        [
          'user-a',
          30,
        ],
        [
          'user-b',
          20,
        ],
      ],
    );
    expect(
      claims.map(
        (
          c,
        ) =>
          c.idempotencyKey,
      ),
    ).toEqual(
      table.players.map(
        (
          p,
        ) =>
          `rl-return:${p.stakeId}`,
      ),
    );
    expect(
      unsavedTableClaims(
        {
          ...table,
          phase:
            'betting',
        },
      ),
    ).toHaveLength(
      2,
    );
    // A settlement in flight, a settled table and an idle one owe nothing through this path.
    expect(
      unsavedTableClaims(
        {
          ...table,
          settling: true,
        },
      ),
    ).toEqual(
      [],
    );
    expect(
      unsavedTableClaims(
        {
          ...table,
          phase:
            'results',
        },
      ),
    ).toEqual(
      [],
    );
    expect(
      unsavedTableClaims(
        {
          ...table,
          phase:
            'idle',
        },
      ),
    ).toEqual(
      [],
    );
  });

  it('is not a table when it says the wheel is spinning but holds no number', async () => {
    const store =
      new MemoryCasinoTableStore();
    const first =
      await boot(
        store,
      );
    const {
      roomId,
    } =
      await betAndSpin(
        first,
      );
    await first.rl.refundRouletteOnShutdown();
    const raw =
      JSON.parse(
        store.entries.get(
          `roulette:${roomId}`,
        )!,
      );
    expect(
      parseStoredRouletteTable(
        raw,
      ),
    ).not.toBeNull();
    expect(
      parseStoredRouletteTable(
        {
          ...raw,
          lastResult:
            null,
        },
      ),
    ).toBeNull();
    expect(
      parseStoredRouletteTable(
        {
          ...raw,
          lastResult: 37,
        },
      ),
    ).toBeNull();
  });
});

describe('the switch', () => {
  it('with the switch off a hub shutdown still refunds (the path is unchanged)', async () => {
    vi.resetModules();
    const rl =
      await import('../roulette');
    const world =
      makeWorld(
        rl.registerRouletteHandlers,
      );
    rl.initializeRoulette(
      world.io,
    );
    const a =
      world.connect(
        'sock-a',
        {
          userId:
            'user-a',
          userName:
            'user-a',
        },
      );
    call(
      a,
      'rl:create_room',
      {
        name: 'T',
      },
    );
    await call(
      a,
      'rl:place_bet',
      {
        ...RED,
        amount: 10,
      },
    );
    await call(
      a,
      'rl:clear_bets',
    );
    await call(
      a,
      'rl:place_bet',
      {
        ...RED,
        amount: 10,
      },
    );
    const summary =
      await rl.refundRouletteOnShutdown();
    expect(
      summary,
    ).toMatchObject(
      {
        claims: 1,
        amount: 10,
        refunded: 1,
      },
    );
    expect(
      summary.saved,
    ).toBeUndefined();
    expect(
      ledger.credits,
    ).toEqual(
      [
        {
          userId:
            'user-a',
          amount: 10,
          note: 'Roulette bet cleared',
          key: undefined,
        },
        {
          userId:
            'user-a',
          amount: 10,
          note: 'Roulette stake refund (server restart)',
          key: expect.stringMatching(
            /^casino-shutdown:roulette:/,
          ),
        },
      ],
    );
  });
});
