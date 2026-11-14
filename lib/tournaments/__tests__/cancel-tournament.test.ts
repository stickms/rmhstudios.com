/* eslint-disable @typescript-eslint/no-explicit-any -- a stateful Prisma mock is untyped by nature. */
/**
 * Cancelling a tournament refunds its entrants AND closes its open matches.
 * Before, the matches stayed PENDING/READY/LIVE forever: nothing could settle
 * them (settling requires a LIVE tournament), yet the bracket still showed them
 * as playable. This pins the close, its idempotence, and the error a late
 * report gets.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
} from 'vitest';

const creditCoins =
  vi
    .fn()
    .mockResolvedValue(
      undefined,
    );
const recordWagerTxn =
  vi
    .fn()
    .mockResolvedValue(
      undefined,
    );
vi.mock(
  '@/lib/wager/escrow.server',
  () => ({
    creditCoins,
    recordWagerTxn,
    debitCoins:
      vi.fn(),
    EscrowError: class EscrowError extends Error {},
  }),
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
    createNotification:
      vi.fn(),
  }),
);

type MatchState =
  | 'PENDING'
  | 'READY'
  | 'LIVE'
  | 'COMPLETE'
  | 'BYE'
  | 'CANCELLED';
interface MatchRow {
  id: string;
  tournamentId: string;
  round: number;
  slot: number;
  entrantAId:
    | string
    | null;
  entrantBId:
    | string
    | null;
  winnerEntrantId:
    | string
    | null;
  state: MatchState;
  nextMatchId:
    | string
    | null;
  nextSlot:
    | number
    | null;
}

let tournament: any;
let matches: Map<
  string,
  MatchRow
>;
let entrants: Array<{
  id: string;
  tournamentId: string;
  userId: string;
}>;

function matchesWhere(
  row: MatchRow,
  where: any,
): boolean {
  if (
    where.id &&
    row.id !==
      where.id
  )
    return false;
  if (
    where.tournamentId &&
    row.tournamentId !==
      where.tournamentId
  )
    return false;
  const st =
    where.state;
  if (
    typeof st ===
      'string' &&
    row.state !==
      st
  )
    return false;
  if (
    st?.in &&
    !st.in.includes(
      row.state,
    )
  )
    return false;
  if (
    st?.notIn &&
    st.notIn.includes(
      row.state,
    )
  )
    return false;
  if (
    st?.not &&
    row.state ===
      st.not
  )
    return false;
  return true;
}

const db: any =
  {
    $transaction:
      async (
        fn: (
          tx: any,
        ) => Promise<unknown>,
      ) =>
        fn(
          db,
        ),
    tournament:
      {
        findUnique:
          async ({
            where,
          }: any) =>
            where.id ===
            tournament.id
              ? structuredClone(
                  tournament,
                )
              : null,
        updateMany:
          async ({
            where,
            data,
          }: any) => {
            if (
              where.id !==
              tournament.id
            )
              return {
                count: 0,
              };
            if (
              where
                .status
                ?.in &&
              !where.status.in.includes(
                tournament.status,
              )
            )
              return {
                count: 0,
              };
            Object.assign(
              tournament,
              data,
            );
            return {
              count: 1,
            };
          },
      },
    tournamentMatch:
      {
        findUnique:
          async ({
            where,
          }: any) =>
            structuredClone(
              matches.get(
                where.id,
              ),
            ) ??
            null,
        updateMany:
          async ({
            where,
            data,
          }: any) => {
            let count = 0;
            for (const m of matches.values()) {
              if (
                !matchesWhere(
                  m,
                  where,
                )
              )
                continue;
              Object.assign(
                m,
                data,
              );
              count++;
            }
            return {
              count,
            };
          },
      },
    tournamentEntrant:
      {
        findMany:
          async ({
            where,
          }: any) =>
            entrants.filter(
              (
                e,
              ) =>
                where.tournamentId
                  ? e.tournamentId ===
                    where.tournamentId
                  : where
                        .id
                        ?.in
                    ? where.id.in.includes(
                        e.id,
                      )
                    : true,
            ),
        update:
          vi.fn(),
      },
  };

const {
  cancelTournament,
  reportMatch,
  settleMatch,
  TournamentError,
} =
  await import('@/lib/tournaments/tournament.server');

function match(
  id: string,
  state: MatchState,
  a:
    | string
    | null,
  b:
    | string
    | null,
): MatchRow {
  return {
    id,
    tournamentId:
      'T1',
    round: 1,
    slot: 0,
    entrantAId:
      a,
    entrantBId:
      b,
    winnerEntrantId:
      state ===
        'COMPLETE' ||
      state ===
        'BYE'
        ? a
        : null,
    state,
    nextMatchId:
      'final',
    nextSlot: 0,
  };
}

beforeEach(
  () => {
    creditCoins.mockClear();
    recordWagerTxn.mockClear();
    tournament =
      {
        id: 'T1',
        createdById:
          'host',
        status:
          'LIVE',
        format:
          'SINGLE_ELIM',
        entryFeeCoins: 50,
        seedPoolCoins: 0,
        prizePoolCoins: 200,
      };
    entrants =
      [
        'e1',
        'e2',
        'e3',
        'e4',
        'e5',
      ].map(
        (
          id,
        ) => ({
          id,
          tournamentId:
            'T1',
          userId: `u-${id}`,
        }),
      );
    matches =
      new Map(
        [
          match(
            'done',
            'COMPLETE',
            'e1',
            'e2',
          ),
          match(
            'bye',
            'BYE',
            'e5',
            null,
          ),
          match(
            'ready',
            'READY',
            'e3',
            'e4',
          ),
          match(
            'live',
            'LIVE',
            'e3',
            'e4',
          ),
          {
            ...match(
              'final',
              'PENDING',
              'e1',
              null,
            ),
            nextMatchId:
              null,
            nextSlot:
              null,
          },
        ].map(
          (
            m,
          ) => [
            m.id,
            m,
          ],
        ),
      );
  },
);

describe('cancelTournament closes open matches', () => {
  it('moves PENDING/READY/LIVE matches to CANCELLED and keeps decided results', async () => {
    await cancelTournament(
      {
        tournamentId:
          'T1',
        byUserId:
          'host',
      },
      db,
    );

    expect(
      tournament.status,
    ).toBe(
      'CANCELLED',
    );
    expect(
      matches.get(
        'ready',
      )!
        .state,
    ).toBe(
      'CANCELLED',
    );
    expect(
      matches.get(
        'live',
      )!
        .state,
    ).toBe(
      'CANCELLED',
    );
    expect(
      matches.get(
        'final',
      )!
        .state,
    ).toBe(
      'CANCELLED',
    );
    // Results already decided stay as they were.
    expect(
      matches.get(
        'done',
      )!
        .state,
    ).toBe(
      'COMPLETE',
    );
    expect(
      matches.get(
        'done',
      )!
        .winnerEntrantId,
    ).toBe(
      'e1',
    );
    expect(
      matches.get(
        'bye',
      )!
        .state,
    ).toBe(
      'BYE',
    );
    // Every entrant refunded once.
    expect(
      creditCoins,
    ).toHaveBeenCalledTimes(
      entrants.length,
    );
  });

  it('a second cancel changes nothing and refunds nothing', async () => {
    await cancelTournament(
      {
        tournamentId:
          'T1',
        byUserId:
          'host',
      },
      db,
    );
    creditCoins.mockClear();
    const before =
      structuredClone(
        [
          ...matches.values(),
        ],
      );
    await cancelTournament(
      {
        tournamentId:
          'T1',
        byUserId:
          'host',
      },
      db,
    );
    expect(
      [
        ...matches.values(),
      ],
    ).toEqual(
      before,
    );
    expect(
      creditCoins,
    ).not.toHaveBeenCalled();
  });

  it('leaves the matches alone when the cancel loses its CAS (already complete)', async () => {
    tournament.status =
      'COMPLETE';
    await cancelTournament(
      {
        tournamentId:
          'T1',
        byUserId:
          'host',
      },
      db,
    );
    expect(
      matches.get(
        'ready',
      )!
        .state,
    ).toBe(
      'READY',
    );
    expect(
      creditCoins,
    ).not.toHaveBeenCalled();
  });

  it('reporting a cancelled match fails with a clear MATCH_CANCELLED error', async () => {
    await cancelTournament(
      {
        tournamentId:
          'T1',
        byUserId:
          'host',
      },
      db,
    );
    const err =
      await reportMatch(
        {
          tournamentId:
            'T1',
          matchId:
            'ready',
          winnerEntrantId:
            'e3',
          reporterId:
            'host',
        },
        db,
      ).catch(
        (
          e: unknown,
        ) =>
          e,
      );
    expect(
      err,
    ).toBeInstanceOf(
      TournamentError,
    );
    expect(
      err,
    ).toMatchObject(
      {
        code: 'MATCH_CANCELLED',
        status: 409,
      },
    );
    expect(
      matches.get(
        'ready',
      )!
        .state,
    ).toBe(
      'CANCELLED',
    );
    expect(
      matches.get(
        'ready',
      )!
        .winnerEntrantId,
    ).toBeNull();
  });

  it('settleMatch refuses a cancelled match even if it is reached directly', async () => {
    matches.get(
      'ready',
    )!.state =
      'CANCELLED';
    await expect(
      settleMatch(
        {
          tournamentId:
            'T1',
          matchId:
            'ready',
          winnerEntrantId:
            'e3',
          source:
            'admin',
        },
        db,
      ),
    ).rejects.toMatchObject(
      {
        code: 'MATCH_CANCELLED',
      },
    );
    expect(
      db
        .tournamentEntrant
        .update,
    ).not.toHaveBeenCalled();
  });
});
