/* eslint-disable @typescript-eslint/no-explicit-any -- a stateful Prisma fake is untyped by nature. */
/**
 * Match times and deadlines (s07-06) through the real start, settle and
 * scheduling code, against an in-memory Prisma fake that also runs the real
 * escrow helpers: deadlines stamped on every ready path, propose / accept /
 * replace, the 409 on a replaced proposal, who may do what, the host's set, the
 * award (only after the deadline, never over an open claim, through
 * `settleMatch` with payouts at a final) and reminders claimed once under two
 * concurrent cron runs.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const createNotification =
  vi.hoisted(
    () =>
      vi.fn(
        async (
          _input: unknown,
        ) => {},
      ),
  );
vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {},
  }),
);
vi.mock(
  '@/lib/notifications.server',
  () => ({
    createNotification,
  }),
);

const {
  startTournament,
  cancelTournament,
} =
  await import('@/lib/tournaments/tournament.server');
const {
  reportMatch,
} =
  await import('@/lib/tournaments/report.server');
const sched =
  await import('@/lib/tournaments/scheduling.server');

const T0 =
  new Date(
    '2026-12-01T12:00:00.000Z',
  );
const H = 3_600_000;

interface State {
  tournament: any;
  entrants: any[];
  matches: any[];
  coins: Map<
    string,
    number
  >;
  payouts: any[];
  audit: any[];
  blocks: [
    string,
    string,
  ][];
  banned: Map<
    string,
    Date
  >;
}
let state: State;
let nextId = 0;

function matches(
  row: any,
  where: any = {},
): boolean {
  return Object.entries(
    where,
  ).every(
    ([
      k,
      v,
    ]: [
      string,
      any,
    ]) => {
      if (
        k ===
        'tournament'
      )
        return (
          row.tournamentId ===
            state
              .tournament
              .id &&
          matches(
            state.tournament,
            v,
          )
        );
      const val =
        row[
          k
        ];
      if (
        v ===
        null
      )
        return (
          val ==
          null
        );
      if (
        v instanceof
        Date
      )
        return (
          val instanceof
            Date &&
          val.getTime() ===
            v.getTime()
        );
      if (
        typeof v ===
        'object'
      ) {
        if (
          'in' in
            v &&
          !v.in.includes(
            val,
          )
        )
          return false;
        if (
          'notIn' in
            v &&
          v.notIn.includes(
            val,
          )
        )
          return false;
        if (
          'not' in
            v &&
          (v.not ===
          null
            ? val ==
              null
            : val ===
              v.not)
        )
          return false;
        if (
          'gt' in
            v &&
          !(
            val !=
              null &&
            val.getTime() >
              v.gt.getTime()
          )
        )
          return false;
        if (
          'lte' in
            v &&
          !(
            val !=
              null &&
            val.getTime() <=
              v.lte.getTime()
          )
        )
          return false;
        return true;
      }
      return (
        val ===
        v
      );
    },
  );
}

function apply(
  row: any,
  data: any,
) {
  for (const [
    k,
    v,
  ] of Object.entries<any>(
    data,
  )) {
    if (
      v &&
      typeof v ===
        'object' &&
      !(
        v instanceof
        Date
      ) &&
      'increment' in
        v
    )
      row[
        k
      ] +=
        v.increment;
    else
      row[
        k
      ] =
        v;
  }
}

function withEntrants(
  m: any,
  select: any,
) {
  const out: any =
    {
      ...m,
    };
  if (
    select?.tournament
  )
    out.tournament =
      {
        id: state
          .tournament
          .id,
        name: state
          .tournament
          .name,
      };
  if (
    select?.entrantA
  ) {
    const e =
      state.entrants.find(
        (
          x,
        ) =>
          x.id ===
          m.entrantAId,
      );
    out.entrantA =
      e
        ? {
            userId:
              e.userId,
          }
        : null;
  }
  if (
    select?.entrantB
  ) {
    const e =
      state.entrants.find(
        (
          x,
        ) =>
          x.id ===
          m.entrantBId,
      );
    out.entrantB =
      e
        ? {
            userId:
              e.userId,
          }
        : null;
  }
  return out;
}

function makeDb() {
  const tx: any =
    {
      $executeRaw:
        vi.fn(
          async () => {},
        ),
      tournament:
        {
          findUnique:
            async ({
              where,
            }: any) =>
              where.id ===
              state
                .tournament
                .id
                ? {
                    ...state.tournament,
                  }
                : null,
          updateMany:
            async ({
              where,
              data,
            }: any) => {
              if (
                !matches(
                  state.tournament,
                  where,
                )
              )
                return {
                  count: 0,
                };
              apply(
                state.tournament,
                data,
              );
              return {
                count: 1,
              };
            },
          update:
            async ({
              data,
            }: any) => {
              apply(
                state.tournament,
                data,
              );
            },
        },
      tournamentEntrant:
        {
          findMany:
            async ({
              where,
            }: any) =>
              state.entrants.filter(
                (
                  e,
                ) =>
                  matches(
                    e,
                    where,
                  ),
              ),
          update:
            async ({
              where,
              data,
            }: any) => {
              apply(
                state.entrants.find(
                  (
                    e,
                  ) =>
                    e.id ===
                    where.id,
                ),
                data,
              );
            },
        },
      tournamentMatch:
        {
          createMany:
            async ({
              data,
            }: any) => {
              for (const d of data) {
                state.matches.push(
                  {
                    id: `m${nextId++}`,
                    winnerEntrantId:
                      null,
                    bracket:
                      'W',
                    loserNextMatchId:
                      null,
                    nextMatchId:
                      null,
                    deadlineAt:
                      null,
                    scheduledAt:
                      null,
                    proposedAt:
                      null,
                    proposedById:
                      null,
                    remindedAt:
                      null,
                    deadlineNoticeAt:
                      null,
                    claimedAt:
                      null,
                    ...d,
                  },
                );
              }
            },
          create:
            async ({
              data,
            }: any) => {
              const row =
                {
                  id: `m${nextId++}`,
                  winnerEntrantId:
                    null,
                  nextMatchId:
                    null,
                  nextSlot:
                    null,
                  deadlineAt:
                    null,
                  claimedAt:
                    null,
                  ...data,
                };
              state.matches.push(
                row,
              );
              return row;
            },
          findMany:
            async ({
              where,
              include,
              take,
            }: any) =>
              state.matches
                .filter(
                  (
                    m,
                  ) =>
                    matches(
                      m,
                      where,
                    ),
                )
                .slice(
                  0,
                  take ??
                    1000,
                )
                .map(
                  (
                    m,
                  ) =>
                    withEntrants(
                      m,
                      include,
                    ),
                ),
          findUnique:
            async ({
              where,
            }: any) => {
              const m =
                state.matches.find(
                  (
                    x,
                  ) =>
                    x.id ===
                    where.id,
                );
              return m
                ? {
                    ...m,
                  }
                : null;
            },
          update:
            async ({
              where,
              data,
            }: any) => {
              apply(
                state.matches.find(
                  (
                    m,
                  ) =>
                    m.id ===
                    where.id,
                ),
                data,
              );
            },
          updateMany:
            async ({
              where,
              data,
            }: any) => {
              const rows =
                state.matches.filter(
                  (
                    m,
                  ) =>
                    matches(
                      m,
                      where,
                    ),
                );
              rows.forEach(
                (
                  r,
                ) =>
                  apply(
                    r,
                    data,
                  ),
              );
              return {
                count:
                  rows.length,
              };
            },
        },
      tournamentPayout:
        {
          create:
            async ({
              data,
            }: any) => {
              state.payouts.push(
                data,
              );
            },
        },
      user: {
        findUnique:
          async ({
            where,
          }: any) => ({
            bannedUntil:
              state.banned.get(
                where.id,
              ) ??
              null,
          }),
      },
      userBlock:
        {
          findFirst:
            async ({
              where,
            }: any) => {
              const pairs =
                where.OR.map(
                  (
                    o: any,
                  ) => [
                    o.blockerId,
                    o.blockedId,
                  ],
                );
              const hit =
                state.blocks.some(
                  ([
                    a,
                    b,
                  ]) =>
                    pairs.some(
                      ([
                        x,
                        y,
                      ]: string[]) =>
                        x ===
                          a &&
                        y ===
                          b,
                    ),
                );
              return hit
                ? {
                    id: 'b1',
                  }
                : null;
            },
        },
      adminAuditLog:
        {
          create:
            async ({
              data,
            }: any) => {
              state.audit.push(
                data,
              );
            },
        },
      userProfile:
        {
          upsert:
            async ({
              where,
              create,
              update,
            }: any) => {
              const cur =
                state.coins.get(
                  where.userId,
                );
              if (
                cur ===
                undefined
              )
                state.coins.set(
                  where.userId,
                  create.coins,
                );
              else
                state.coins.set(
                  where.userId,
                  cur +
                    update
                      .coins
                      .increment,
                );
            },
        },
      coinTransaction:
        {
          create:
            async () => {},
        },
    };
  return {
    ...tx,
    $transaction:
      async (
        fn: (
          t: any,
        ) => Promise<unknown>,
      ) =>
        fn(
          tx,
        ),
  };
}

function seed(
  n: number,
  over: any = {},
) {
  nextId = 0;
  state =
    {
      tournament:
        {
          id: 't1',
          name: 'Spring Cup',
          status:
            'REGISTRATION',
          format:
            'SINGLE_ELIM',
          entryFeeCoins: 100,
          prizePoolCoins:
            100 *
            n,
          seedPoolCoins: 0,
          rakeBps: 500,
          minPlayers: 2,
          maxPlayers: 64,
          createdById:
            'host',
          startsAt:
            null,
          checkInMinutes:
            null,
          matchDeadlineHours: 48,
          ...over,
        },
      entrants:
        Array.from(
          {
            length:
              n,
          },
          (
            _,
            i,
          ) => ({
            id: `e${i + 1}`,
            tournamentId:
              't1',
            userId: `u${i + 1}`,
            joinedAt:
              new Date(
                2026,
                11,
                1,
                12,
                0,
                i,
              ),
            checkedInAt:
              null,
            seed: null,
            wins: 0,
            losses: 0,
            eliminatedAt:
              null,
            placement:
              null,
          }),
        ),
      matches:
        [],
      coins:
        new Map(),
      payouts:
        [],
      audit:
        [],
      blocks:
        [],
      banned:
        new Map(),
    };
}

const at =
  (
    round: number,
    slot = 0,
  ) =>
    state.matches.find(
      (
        m,
      ) =>
        m.round ===
          round &&
        m.slot ===
          slot,
    );
const base =
  {
    tournamentId:
      't1',
  };
let db: any;

beforeEach(
  () => {
    vi.useFakeTimers(
      {
        toFake:
          [
            'Date',
          ],
      },
    );
    vi.setSystemTime(
      T0,
    );
    createNotification.mockClear();
    db =
      makeDb();
  },
);
afterEach(
  () =>
    vi.useRealTimers(),
);

async function liveFour(
  over: any = {},
) {
  seed(
    4,
    over,
  );
  await startTournament(
    {
      tournamentId:
        't1',
      byUserId:
        'host',
    },
    db,
  );
  return at(
    1,
    0,
  )!; // e1 v e4
}

describe('stamping a deadline on every ready path', () => {
  it('stamps the first round at the start (readyAt + hours) and nothing without a setting', async () => {
    await liveFour();
    expect(
      at(
        1,
        0,
      )!
        .deadlineAt,
    ).toEqual(
      new Date(
        T0.getTime() +
          48 *
            H,
      ),
    );
    expect(
      at(
        1,
        1,
      )!
        .deadlineAt,
    ).toEqual(
      new Date(
        T0.getTime() +
          48 *
            H,
      ),
    );
    expect(
      at(
        2,
      )!
        .deadlineAt,
    ).toBeNull(); // still PENDING
    await liveFour(
      {
        matchDeadlineHours:
          null,
      },
    );
    expect(
      state.matches.every(
        (
          m,
        ) =>
          m.deadlineAt ===
          null,
      ),
    ).toBe(
      true,
    );
  });

  it('stamps a match when its second entrant arrives (fillSlot), from that moment', async () => {
    await liveFour();
    await reportMatch(
      {
        ...base,
        matchId:
          at(
            1,
            0,
          )!
            .id,
        winnerEntrantId:
          'e1',
        reporterId:
          'host',
      },
      db,
    );
    expect(
      at(
        2,
      )!
        .deadlineAt,
    ).toBeNull(); // one slot filled
    vi.setSystemTime(
      new Date(
        T0.getTime() +
          5 *
            H,
      ),
    );
    await reportMatch(
      {
        ...base,
        matchId:
          at(
            1,
            1,
          )!
            .id,
        winnerEntrantId:
          'e2',
        reporterId:
          'host',
      },
      db,
    );
    expect(
      at(
        2,
      ),
    ).toMatchObject(
      {
        state:
          'READY',
      },
    );
    expect(
      at(
        2,
      )!
        .deadlineAt,
    ).toEqual(
      new Date(
        T0.getTime() +
          53 *
            H,
      ),
    );
  });

  it('stamps the bracket-reset match of a double-elimination grand final', async () => {
    seed(
      4,
      {
        format:
          'DOUBLE_ELIM',
        minPlayers: 4,
      },
    );
    await startTournament(
      {
        tournamentId:
          't1',
        byUserId:
          'host',
      },
      db,
    );
    const play =
      (
        m: any,
        w: string,
      ) =>
        reportMatch(
          {
            ...base,
            matchId:
              m.id,
            winnerEntrantId:
              w,
            reporterId:
              'host',
          },
          db,
        );
    await play(
      at(
        1,
        0,
      ),
      'e1',
    );
    await play(
      at(
        1,
        1,
      ),
      'e2',
    );
    await play(
      at(
        3,
      ),
      'e3',
    );
    await play(
      at(
        2,
      ),
      'e1',
    );
    await play(
      at(
        4,
      ),
      'e2',
    );
    await play(
      at(
        5,
      ),
      'e2',
    ); // the losers champion wins: a reset follows
    expect(
      at(
        6,
      ),
    ).toMatchObject(
      {
        bracket:
          'GR',
        state:
          'READY',
      },
    );
    expect(
      at(
        6,
      )!
        .deadlineAt,
    ).toBeInstanceOf(
      Date,
    );
  });

  it('gives every Swiss pairing a deadline when the round is generated', async () => {
    seed(
      4,
      {
        format:
          'SWISS',
      },
    );
    await startTournament(
      {
        tournamentId:
          't1',
        byUserId:
          'host',
      },
      db,
    );
    const round1 =
      state.matches.filter(
        (
          m,
        ) =>
          m.round ===
          1,
      );
    expect(
      round1,
    ).toHaveLength(
      2,
    );
    expect(
      round1.every(
        (
          m,
        ) =>
          m.deadlineAt instanceof
          Date,
      ),
    ).toBe(
      true,
    );
    for (const m of round1) {
      await reportMatch(
        {
          ...base,
          matchId:
            m.id,
          winnerEntrantId:
            m.entrantAId,
          reporterId:
            'host',
        },
        db,
      );
    }
    const round2 =
      state.matches.filter(
        (
          m,
        ) =>
          m.round ===
          2,
      );
    expect(
      round2.length,
    ).toBeGreaterThan(
      0,
    );
    expect(
      round2.every(
        (
          m,
        ) =>
          m.deadlineAt instanceof
          Date,
      ),
    ).toBe(
      true,
    );
  });

  it('a settings change applies to matches that become ready afterwards, not to stamped ones', async () => {
    await liveFour();
    await sched.updateDeadlineSettings(
      {
        ...base,
        byUserId:
          'host',
        matchDeadlineHours: 24,
      },
      db,
    );
    expect(
      state
        .tournament
        .matchDeadlineHours,
    ).toBe(
      24,
    );
    expect(
      at(
        1,
        0,
      )!
        .deadlineAt,
    ).toEqual(
      new Date(
        T0.getTime() +
          48 *
            H,
      ),
    );
    await reportMatch(
      {
        ...base,
        matchId:
          at(
            1,
            0,
          )!
            .id,
        winnerEntrantId:
          'e1',
        reporterId:
          'host',
      },
      db,
    );
    await reportMatch(
      {
        ...base,
        matchId:
          at(
            1,
            1,
          )!
            .id,
        winnerEntrantId:
          'e2',
        reporterId:
          'host',
      },
      db,
    );
    expect(
      at(
        2,
      )!
        .deadlineAt,
    ).toEqual(
      new Date(
        T0.getTime() +
          24 *
            H,
      ),
    );
  });

  it('only the host sets it, from a listed value, and not on a finished tournament', async () => {
    await liveFour();
    await expect(
      sched.updateDeadlineSettings(
        {
          ...base,
          byUserId:
            'u1',
          matchDeadlineHours: 24,
        },
        db,
      ),
    ).rejects.toMatchObject(
      {
        status: 403,
      },
    );
    await expect(
      sched.updateDeadlineSettings(
        {
          ...base,
          byUserId:
            'host',
          matchDeadlineHours: 5,
        },
        db,
      ),
    ).rejects.toMatchObject(
      {
        code: 'BAD_DEADLINE',
      },
    );
    state.tournament.status =
      'COMPLETE';
    await expect(
      sched.updateDeadlineSettings(
        {
          ...base,
          byUserId:
            'host',
          matchDeadlineHours: 24,
        },
        db,
      ),
    ).rejects.toMatchObject(
      {
        status: 409,
      },
    );
  });
});

describe('proposing and accepting a time', () => {
  const tomorrow =
    new Date(
      T0.getTime() +
        20 *
          H,
    );

  it('a player proposes, the opponent is told, and the proposal is stored on the match', async () => {
    const m =
      await liveFour();
    await sched.proposeTime(
      {
        ...base,
        matchId:
          m.id,
        userId:
          'u1',
        at: tomorrow,
      },
      db,
      T0,
    );
    expect(
      at(
        1,
        0,
      ),
    ).toMatchObject(
      {
        proposedAt:
          tomorrow,
        proposedById:
          'u1',
      },
    );
    expect(
      createNotification,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      createNotification
        .mock
        .calls[0]![0],
    ).toMatchObject(
      {
        userId:
          'u4',
        entityType:
          'match-proposal',
      },
    );
  });

  it('refuses a non-entrant, a past time, a time after the deadline and a settled match', async () => {
    const m =
      await liveFour();
    await expect(
      sched.proposeTime(
        {
          ...base,
          matchId:
            m.id,
          userId:
            'u2',
          at: tomorrow,
        },
        db,
        T0,
      ),
    ).rejects.toMatchObject(
      {
        status: 403,
      },
    );
    await expect(
      sched.proposeTime(
        {
          ...base,
          matchId:
            m.id,
          userId:
            'u1',
          at: new Date(
            T0.getTime() -
              H,
          ),
        },
        db,
        T0,
      ),
    ).rejects.toMatchObject(
      {
        code: 'PAST',
      },
    );
    await expect(
      sched.proposeTime(
        {
          ...base,
          matchId:
            m.id,
          userId:
            'u1',
          at: new Date(
            T0.getTime() +
              49 *
                H,
          ),
        },
        db,
        T0,
      ),
    ).rejects.toMatchObject(
      {
        code: 'AFTER_DEADLINE',
      },
    );
    await reportMatch(
      {
        ...base,
        matchId:
          m.id,
        winnerEntrantId:
          'e1',
        reporterId:
          'host',
      },
      db,
    );
    await expect(
      sched.proposeTime(
        {
          ...base,
          matchId:
            m.id,
          userId:
            'u1',
          at: tomorrow,
        },
        db,
        T0,
      ),
    ).rejects.toMatchObject(
      {
        code: 'NOT_READY',
      },
    );
  });

  it('a banned player cannot propose', async () => {
    const m =
      await liveFour();
    state.banned.set(
      'u1',
      new Date(
        T0.getTime() +
          H,
      ),
    );
    await expect(
      sched.proposeTime(
        {
          ...base,
          matchId:
            m.id,
          userId:
            'u1',
          at: tomorrow,
        },
        db,
        T0,
      ),
    ).rejects.toMatchObject(
      {
        code: 'BANNED',
      },
    );
  });

  it('a proposal from a blocked opponent is stored but not notified', async () => {
    const m =
      await liveFour();
    state.blocks.push(
      [
        'u4',
        'u1',
      ],
    ); // u4 blocked u1
    await sched.proposeTime(
      {
        ...base,
        matchId:
          m.id,
        userId:
          'u1',
        at: tomorrow,
      },
      db,
      T0,
    );
    expect(
      at(
        1,
        0,
      )!
        .proposedById,
    ).toBe(
      'u1',
    );
    expect(
      createNotification,
    ).not.toHaveBeenCalled();
  });

  it('the opponent accepts: the time is agreed, the proposal clears, both are told', async () => {
    const m =
      await liveFour();
    await sched.proposeTime(
      {
        ...base,
        matchId:
          m.id,
        userId:
          'u1',
        at: tomorrow,
      },
      db,
      T0,
    );
    createNotification.mockClear();
    const res =
      await sched.acceptTime(
        {
          ...base,
          matchId:
            m.id,
          userId:
            'u4',
          proposedAt:
            tomorrow,
        },
        db,
        T0,
      );
    expect(
      res.scheduledAt,
    ).toEqual(
      tomorrow,
    );
    expect(
      at(
        1,
        0,
      ),
    ).toMatchObject(
      {
        scheduledAt:
          tomorrow,
        proposedAt:
          null,
        proposedById:
          null,
        remindedAt:
          null,
        agreedNoticeAt:
          T0,
      },
    );
    const told =
      createNotification.mock.calls
        .map(
          (
            c,
          ) =>
            (
              c[0] as any
            )
              .userId,
        )
        .sort();
    expect(
      told,
    ).toEqual(
      [
        'u1',
        'u4',
      ],
    );
    expect(
      createNotification.mock.calls.every(
        (
          c,
        ) =>
          (
            c[0] as any
          )
            .entityType ===
          'match-agreed',
      ),
    ).toBe(
      true,
    );
  });

  it('proposing another replaces the live proposal; accepting the replaced one is 409 PROPOSAL_CHANGED', async () => {
    const m =
      await liveFour();
    const first =
      tomorrow;
    const second =
      new Date(
        T0.getTime() +
          26 *
            H,
      );
    await sched.proposeTime(
      {
        ...base,
        matchId:
          m.id,
        userId:
          'u1',
        at: first,
      },
      db,
      T0,
    );
    await sched.proposeTime(
      {
        ...base,
        matchId:
          m.id,
        userId:
          'u4',
        at: second,
      },
      db,
      T0,
    );
    expect(
      at(
        1,
        0,
      ),
    ).toMatchObject(
      {
        proposedAt:
          second,
        proposedById:
          'u4',
      },
    );
    await expect(
      sched.acceptTime(
        {
          ...base,
          matchId:
            m.id,
          userId:
            'u4',
          proposedAt:
            first,
        },
        db,
        T0,
      ),
    ).rejects.toMatchObject(
      {
        status: 409,
        code: 'PROPOSAL_CHANGED',
      },
    );
    expect(
      at(
        1,
        0,
      )!
        .scheduledAt,
    ).toBeNull();
  });

  it('nobody accepts their own proposal, and a non-entrant cannot accept', async () => {
    const m =
      await liveFour();
    await sched.proposeTime(
      {
        ...base,
        matchId:
          m.id,
        userId:
          'u1',
        at: tomorrow,
      },
      db,
      T0,
    );
    await expect(
      sched.acceptTime(
        {
          ...base,
          matchId:
            m.id,
          userId:
            'u1',
          proposedAt:
            tomorrow,
        },
        db,
        T0,
      ),
    ).rejects.toMatchObject(
      {
        code: 'OWN_PROPOSAL',
      },
    );
    await expect(
      sched.acceptTime(
        {
          ...base,
          matchId:
            m.id,
          userId:
            'u2',
          proposedAt:
            tomorrow,
        },
        db,
        T0,
      ),
    ).rejects.toMatchObject(
      {
        status: 403,
      },
    );
  });

  it('serialises on the match lock key a result claim takes', async () => {
    const m =
      await liveFour();
    db.$executeRaw.mockClear();
    const calls: unknown[][] =
      [];
    db.$executeRaw.mockImplementation(
      async (
        ...args: unknown[]
      ) => {
        calls.push(
          args,
        );
      },
    );
    await sched.proposeTime(
      {
        ...base,
        matchId:
          m.id,
        userId:
          'u1',
        at: tomorrow,
      },
      db,
      T0,
    );
    expect(
      calls.length,
    ).toBeGreaterThan(
      0,
    );
    expect(
      calls[0]!.slice(
        1,
      ),
    ).toEqual(
      [
        'tournament-match:' +
          m.id,
      ],
    );
  });
});

describe('the host sets a time', () => {
  const when =
    new Date(
      T0.getTime() +
        10 *
          H,
    );

  it('the host (or an admin) sets it and clears the proposal; a player cannot', async () => {
    const m =
      await liveFour();
    await sched.proposeTime(
      {
        ...base,
        matchId:
          m.id,
        userId:
          'u1',
        at: when,
      },
      db,
      T0,
    );
    await expect(
      sched.setTimeAsHost(
        {
          ...base,
          matchId:
            m.id,
          byUserId:
            'u1',
          at: when,
        },
        db,
        T0,
      ),
    ).rejects.toMatchObject(
      {
        status: 403,
      },
    );
    await sched.setTimeAsHost(
      {
        ...base,
        matchId:
          m.id,
        byUserId:
          'host',
        at: when,
      },
      db,
      T0,
    );
    expect(
      at(
        1,
        0,
      ),
    ).toMatchObject(
      {
        scheduledAt:
          when,
        proposedAt:
          null,
        proposedById:
          null,
      },
    );
    await sched.setTimeAsHost(
      {
        ...base,
        matchId:
          m.id,
        byUserId:
          'someone',
        isAdmin: true,
        at: null,
      },
      db,
      T0,
    );
    expect(
      at(
        1,
        0,
      )!
        .scheduledAt,
    ).toBeNull();
  });

  it('refuses a time after the deadline, and a match that is not ready', async () => {
    const m =
      await liveFour();
    await expect(
      sched.setTimeAsHost(
        {
          ...base,
          matchId:
            m.id,
          byUserId:
            'host',
          at: new Date(
            T0.getTime() +
              60 *
                H,
          ),
        },
        db,
        T0,
      ),
    ).rejects.toMatchObject(
      {
        code: 'AFTER_DEADLINE',
      },
    );
    await expect(
      sched.setTimeAsHost(
        {
          ...base,
          matchId:
            at(
              2,
            )!
              .id,
          byUserId:
            'host',
          at: when,
        },
        db,
        T0,
      ),
    ).rejects.toMatchObject(
      {
        code: 'NOT_READY',
      },
    );
  });
});

describe('awarding an overdue match', () => {
  const late =
    new Date(
      T0.getTime() +
        49 *
          H,
    );

  it('refuses before the deadline, and for anyone but the host or an admin', async () => {
    const m =
      await liveFour();
    await expect(
      sched.awardWalkover(
        {
          ...base,
          matchId:
            m.id,
          byUserId:
            'host',
          winnerEntrantId:
            'e1',
        },
        db,
        T0,
      ),
    ).rejects.toMatchObject(
      {
        code: 'NOT_OVERDUE',
      },
    );
    await expect(
      sched.awardWalkover(
        {
          ...base,
          matchId:
            m.id,
          byUserId:
            'u1',
          winnerEntrantId:
            'e1',
        },
        db,
        late,
      ),
    ).rejects.toMatchObject(
      {
        status: 403,
      },
    );
    expect(
      at(
        1,
        0,
      )!
        .state,
    ).toBe(
      'READY',
    );
  });

  it('refuses while a result claim is open (a claim or a dispute)', async () => {
    const m =
      await liveFour();
    state.matches.find(
      (
        x,
      ) =>
        x.id ===
        m.id,
    ).claimedAt =
      new Date(
        T0.getTime() +
          47 *
            H,
      );
    await expect(
      sched.awardWalkover(
        {
          ...base,
          matchId:
            m.id,
          byUserId:
            'host',
          winnerEntrantId:
            'e1',
        },
        db,
        late,
      ),
    ).rejects.toMatchObject(
      {
        code: 'OPEN_CLAIM',
      },
    );
    expect(
      at(
        1,
        0,
      )!
        .state,
    ).toBe(
      'READY',
    );
  });

  it('refuses a winner outside the match', async () => {
    const m =
      await liveFour();
    await expect(
      sched.awardWalkover(
        {
          ...base,
          matchId:
            m.id,
          byUserId:
            'host',
          winnerEntrantId:
            'e2',
        },
        db,
        late,
      ),
    ).rejects.toMatchObject(
      {
        code: 'BAD_WINNER',
      },
    );
  });

  it('settles through settleMatch as a walkover and advances the bracket like a played match', async () => {
    const m =
      await liveFour();
    const res =
      await sched.awardWalkover(
        {
          ...base,
          matchId:
            m.id,
          byUserId:
            'host',
          winnerEntrantId:
            'e1',
        },
        db,
        late,
      );
    expect(
      res,
    ).toEqual(
      {
        settled: true,
        tournamentComplete: false,
      },
    );
    expect(
      at(
        1,
        0,
      ),
    ).toMatchObject(
      {
        state:
          'COMPLETE',
        winnerEntrantId:
          'e1',
        resultSource:
          'walkover',
      },
    );
    expect(
      state.entrants.find(
        (
          e,
        ) =>
          e.id ===
          'e4',
      )
        .eliminatedAt,
    ).not.toBeNull();
    expect(
      at(
        2,
      )!
        .entrantAId,
    ).toBe(
      'e1',
    );
    expect(
      state.audit,
    ).toEqual(
      [
        expect.objectContaining(
          {
            adminId:
              'host',
            action:
              'tournament.match.award',
            targetId:
              m.id,
          },
        ),
      ],
    );
    const types =
      createNotification.mock.calls.map(
        (
          c,
        ) =>
          (
            c[0] as any
          )
            .entityType,
      );
    expect(
      types,
    ).toEqual(
      [
        'match-awarded',
        'match-awarded',
      ],
    );
  });

  it('pays out when the awarded match is the final', async () => {
    seed(
      2,
    );
    await startTournament(
      {
        tournamentId:
          't1',
        byUserId:
          'host',
      },
      db,
    );
    const final =
      at(
        1,
        0,
      )!;
    const res =
      await sched.awardWalkover(
        {
          ...base,
          matchId:
            final.id,
          byUserId:
            'host',
          winnerEntrantId:
            'e2',
        },
        db,
        late,
      );
    expect(
      res.tournamentComplete,
    ).toBe(
      true,
    );
    expect(
      state
        .tournament
        .status,
    ).toBe(
      'COMPLETE',
    );
    expect(
      state
        .payouts
        .length,
    ).toBeGreaterThan(
      0,
    );
    expect(
      state
        .payouts[0],
    ).toMatchObject(
      {
        userId:
          'u2',
        placement: 1,
      },
    );
  });

  it('is never done by the cron: an overdue match stays open however many runs pass', async () => {
    await liveFour();
    await sched.runScheduleNotices(
      db,
      late,
    );
    await sched.runScheduleNotices(
      db,
      new Date(
        late.getTime() +
          24 *
            H,
      ),
    );
    expect(
      at(
        1,
        0,
      )!
        .state,
    ).toBe(
      'READY',
    );
    expect(
      at(
        1,
        0,
      )!
        .winnerEntrantId,
    ).toBeNull();
  });

  it('a cancelled tournament clears live proposals with its matches', async () => {
    const m =
      await liveFour();
    await sched.proposeTime(
      {
        ...base,
        matchId:
          m.id,
        userId:
          'u1',
        at: new Date(
          T0.getTime() +
            20 *
              H,
        ),
      },
      db,
      T0,
    );
    await cancelTournament(
      {
        tournamentId:
          't1',
        byUserId:
          'host',
      },
      db,
    );
    expect(
      at(
        1,
        0,
      ),
    ).toMatchObject(
      {
        state:
          'CANCELLED',
        proposedAt:
          null,
        proposedById:
          null,
      },
    );
  });
});

describe('reminders', () => {
  it('sends the 60-minute reminder once, even when two cron runs overlap', async () => {
    const m =
      await liveFour();
    const when =
      new Date(
        T0.getTime() +
          2 *
            H,
      );
    await sched.setTimeAsHost(
      {
        ...base,
        matchId:
          m.id,
        byUserId:
          'host',
        at: when,
      },
      db,
      T0,
    );
    createNotification.mockClear();
    const now =
      new Date(
        when.getTime() -
          30 *
            60_000,
      );
    const [
      a,
      b,
    ] =
      await Promise.all(
        [
          sched.runScheduleNotices(
            db,
            now,
          ),
          sched.runScheduleNotices(
            db,
            now,
          ),
        ],
      );
    expect(
      a.reminded +
        b.reminded,
    ).toBe(
      1,
    );
    const reminders =
      createNotification.mock.calls.filter(
        (
          c,
        ) =>
          (
            c[0] as any
          )
            .entityType ===
          'match-reminder',
      );
    expect(
      reminders
        .map(
          (
            c,
          ) =>
            (
              c[0] as any
            )
              .userId,
        )
        .sort(),
    ).toEqual(
      [
        'u1',
        'u4',
      ],
    );
    expect(
      at(
        1,
        0,
      )!
        .remindedAt,
    ).toEqual(
      now,
    );
    // A later run does nothing more.
    createNotification.mockClear();
    expect(
      (
        await sched.runScheduleNotices(
          db,
          new Date(
            now.getTime() +
              60_000,
          ),
        )
      )
        .reminded,
    ).toBe(
      0,
    );
  });

  it('does not remind before the hour, or for a time already past', async () => {
    const m =
      await liveFour();
    const when =
      new Date(
        T0.getTime() +
          5 *
            H,
      );
    await sched.setTimeAsHost(
      {
        ...base,
        matchId:
          m.id,
        byUserId:
          'host',
        at: when,
      },
      db,
      T0,
    );
    expect(
      (
        await sched.runScheduleNotices(
          db,
          T0,
        )
      )
        .reminded,
    ).toBe(
      0,
    );
    expect(
      (
        await sched.runScheduleNotices(
          db,
          new Date(
            when.getTime() +
              1000,
          ),
        )
      )
        .reminded,
    ).toBe(
      0,
    );
  });

  it('a new agreed time earns a new reminder', async () => {
    const m =
      await liveFour();
    const first =
      new Date(
        T0.getTime() +
          2 *
            H,
      );
    await sched.setTimeAsHost(
      {
        ...base,
        matchId:
          m.id,
        byUserId:
          'host',
        at: first,
      },
      db,
      T0,
    );
    await sched.runScheduleNotices(
      db,
      new Date(
        first.getTime() -
          30 *
            60_000,
      ),
    );
    expect(
      at(
        1,
        0,
      )!
        .remindedAt,
    ).not.toBeNull();
    const second =
      new Date(
        T0.getTime() +
          10 *
            H,
      );
    await sched.setTimeAsHost(
      {
        ...base,
        matchId:
          m.id,
        byUserId:
          'host',
        at: second,
      },
      db,
      T0,
    );
    expect(
      at(
        1,
        0,
      )!
        .remindedAt,
    ).toBeNull();
  });

  it('sends the deadline notice 12 hours out once, and not when a result is claimed', async () => {
    await liveFour();
    const near =
      new Date(
        T0.getTime() +
          37 *
            H,
      ); // 11 hours before the deadline
    const [
      a,
      b,
    ] =
      await Promise.all(
        [
          sched.runScheduleNotices(
            db,
            near,
          ),
          sched.runScheduleNotices(
            db,
            near,
          ),
        ],
      );
    // Both first-round matches are due; each is claimed once across the two runs.
    expect(
      a.deadlineNotices +
        b.deadlineNotices,
    ).toBe(
      2,
    );
    expect(
      at(
        1,
        0,
      )!
        .deadlineNoticeAt,
    ).toEqual(
      near,
    );
    expect(
      createNotification.mock.calls.filter(
        (
          c,
        ) =>
          (
            c[0] as any
          )
            .entityType ===
          'match-deadline',
      ),
    ).toHaveLength(
      4,
    );

    createNotification.mockClear();
    const m2 =
      await liveFour();
    state.matches.find(
      (
        x,
      ) =>
        x.id ===
        m2.id,
    ).claimedAt =
      T0;
    expect(
      (
        await sched.runScheduleNotices(
          db,
          near,
        )
      )
        .deadlineNotices,
    ).toBe(
      1,
    ); // only the other match
  });
});
