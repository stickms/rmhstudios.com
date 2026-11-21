import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { PASSAGES } from '@/lib/rmhtype/passages';
import { dailyFinishBody } from '@/lib/rmhtype/daily-schema';
import {
  DAILY_WINDOW_MS,
  passageForDay,
} from '@/lib/rmhtype/daily';

// The daily board is a comparison between members, so the server owns the clock:
// a second Start keeps the first stamp, Finish measures its own elapsed time, a
// result no keyboard could produce is refused, and a run is accepted once.

interface Row {
  id: number;
  userId: string;
  day: string;
  passageId: string;
  startedAt: Date;
  finishedAt: Date | null;
  wpm:
    | number
    | null;
  accuracy:
    | number
    | null;
  timeMs:
    | number
    | null;
}

const db =
  vi.hoisted(
    () => ({
      rows: [] as unknown[],
      following:
        [] as string[],
      invalidated:
        [] as string[],
    }),
  );
const rows =
  () =>
    db.rows as Row[];

type Where =
  {
    userId?:
      | string
      | {
          in: string[];
        };
    day?: string;
    wpm?: {
      not: null;
    };
    finishedAt?: null;
    userId_day?: {
      userId: string;
      day: string;
    };
  };

function matches(
  r: Row,
  w: Where,
): boolean {
  if (
    w.userId_day
  )
    return (
      r.userId ===
        w
          .userId_day
          .userId &&
      r.day ===
        w
          .userId_day
          .day
    );
  if (
    w.day !==
      undefined &&
    r.day !==
      w.day
  )
    return false;
  if (
    typeof w.userId ===
      'string' &&
    r.userId !==
      w.userId
  )
    return false;
  if (
    typeof w.userId ===
      'object' &&
    !w.userId.in.includes(
      r.userId,
    )
  )
    return false;
  if (
    w.wpm &&
    r.wpm ===
      null
  )
    return false;
  if (
    w.finishedAt ===
      null &&
    r.finishedAt !==
      null
  )
    return false;
  return true;
}

const better =
  (
    a: Row,
    b: Row,
  ) =>
    (b.wpm ??
      0) -
      (a.wpm ??
        0) ||
    (b.accuracy ??
      0) -
      (a.accuracy ??
        0) ||
    (a.finishedAt?.getTime() ??
      0) -
      (b.finishedAt?.getTime() ??
        0);

vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {
        rmhTypeDailyEntry:
          {
            findUnique:
              vi.fn(
                async ({
                  where,
                }: {
                  where: Where;
                }) =>
                  rows().find(
                    (
                      r,
                    ) =>
                      matches(
                        r,
                        where,
                      ),
                  ) ??
                  null,
              ),
            upsert:
              vi.fn(
                async ({
                  where,
                  create,
                }: {
                  where: Where;
                  update: Record<
                    string,
                    never
                  >;
                  create: Omit<
                    Row,
                    | 'id'
                    | 'finishedAt'
                    | 'wpm'
                    | 'accuracy'
                    | 'timeMs'
                  >;
                }) => {
                  const found =
                    rows().find(
                      (
                        r,
                      ) =>
                        matches(
                          r,
                          where,
                        ),
                    );
                  if (
                    found
                  )
                    return found;
                  const row: Row =
                    {
                      id:
                        rows()
                          .length +
                        1,
                      finishedAt:
                        null,
                      wpm: null,
                      accuracy:
                        null,
                      timeMs:
                        null,
                      ...create,
                    };
                  rows().push(
                    row,
                  );
                  return row;
                },
              ),
            updateMany:
              vi.fn(
                async ({
                  where,
                  data,
                }: {
                  where: Where;
                  data: Partial<Row>;
                }) => {
                  const hit =
                    rows().filter(
                      (
                        r,
                      ) =>
                        matches(
                          r,
                          where,
                        ),
                    );
                  for (const r of hit)
                    Object.assign(
                      r,
                      data,
                    );
                  return {
                    count:
                      hit.length,
                  };
                },
              ),
            count:
              vi.fn(
                async ({
                  where,
                }: {
                  where: Where & {
                    OR: Record<
                      string,
                      unknown
                    >[];
                  };
                }) => {
                  const scoped =
                    rows().filter(
                      (
                        r,
                      ) =>
                        matches(
                          r,
                          where,
                        ),
                    );
                  return scoped.filter(
                    (
                      r,
                    ) =>
                      where.OR.some(
                        (
                          c,
                        ) => {
                          const wpm =
                            c.wpm as
                              | number
                              | {
                                  gt: number;
                                };
                          const accuracy =
                            c.accuracy as
                              | number
                              | {
                                  gt: number;
                                }
                              | undefined;
                          const at =
                            c.finishedAt as
                              | {
                                  lt: Date;
                                }
                              | undefined;
                          const gt =
                            (
                              v:
                                | number
                                | {
                                    gt: number;
                                  }
                                | undefined,
                              x:
                                | number
                                | null,
                            ) =>
                              typeof v ===
                              'object'
                                ? (x ??
                                    0) >
                                  v.gt
                                : x ===
                                  v;
                          return (
                            gt(
                              wpm,
                              r.wpm,
                            ) &&
                            (accuracy ===
                              undefined ||
                              gt(
                                accuracy,
                                r.accuracy,
                              )) &&
                            (at ===
                              undefined ||
                              (r.finishedAt as Date) <
                                at.lt)
                          );
                        },
                      ),
                  )
                    .length;
                },
              ),
            findMany:
              vi.fn(
                async ({
                  where,
                  take,
                }: {
                  where: Where;
                  take?: number;
                }) =>
                  rows()
                    .filter(
                      (
                        r,
                      ) =>
                        matches(
                          r,
                          where,
                        ),
                    )
                    .sort(
                      better,
                    )
                    .slice(
                      0,
                      take,
                    )
                    .map(
                      (
                        r,
                      ) => ({
                        ...r,
                        user: {
                          name: r.userId,
                          handle:
                            null,
                          image:
                            null,
                        },
                      }),
                    ),
              ),
          },
      },
  }),
);
vi.mock(
  '@/lib/cached.server',
  () => ({
    cached:
      async (
        _key: string,
        _ttl: number,
        load: () => Promise<unknown>,
      ) =>
        load(),
    invalidateTag:
      vi.fn(
        async (
          tag: string,
        ) => {
          db.invalidated.push(
            tag,
          );
        },
      ),
  }),
);
vi.mock(
  '@/lib/social/follow-graph.server',
  () => ({
    getFollowingIds:
      vi.fn(
        async () =>
          db.following,
      ),
  }),
);

import {
  finishDaily,
  getDaily,
  getDailyBoard,
  isBoardDay,
  startDaily,
} from '@/lib/rmhtype/daily.server';

const DAY =
  '20261122';
const T0 =
  new Date(
    '2026-11-22T10:00:00Z',
  );
const at =
  (
    ms: number,
  ) =>
    new Date(
      T0.getTime() +
        ms,
    );
const passage =
  PASSAGES.find(
    (
      p,
    ) =>
      p.id ===
      passageForDay(
        DAY,
        PASSAGES.map(
          (
            x,
          ) =>
            x.id,
        ),
      ),
  )!;
const L =
  passage
    .text
    .length;
/** A report that types the passage in full, cleanly. */
const clean =
  {
    day: DAY,
    correct:
      L,
    total:
      L,
  };

beforeEach(
  () => {
    db.rows =
      [];
    db.following =
      [];
    db.invalidated =
      [];
  },
);

describe('start', () => {
  it('hides the text until the member has started', async () => {
    const before =
      await getDaily(
        'u1',
        T0,
      );
    expect(
      before.status,
    ).toBe(
      'ready',
    );
    expect(
      before.text,
    ).toBeNull();
    expect(
      before.passageLength,
    ).toBe(
      L,
    );
    const started =
      await startDaily(
        'u1',
        T0,
      );
    expect(
      started.status,
    ).toBe(
      'running',
    );
    expect(
      started.text,
    ).toBe(
      passage.text,
    );
  });

  it('gives every member the same passage on the same day', async () => {
    const a =
      await startDaily(
        'u1',
        T0,
      );
    const b =
      await startDaily(
        'u2',
        at(
          3_600_000,
        ),
      );
    expect(
      a.text,
    ).toBe(
      b.text,
    );
  });

  it('keeps the first startedAt on a second start', async () => {
    const first =
      await startDaily(
        'u1',
        T0,
      );
    const second =
      await startDaily(
        'u1',
        at(
          5 *
            60_000,
        ),
      );
    expect(
      second.startedAt,
    ).toBe(
      first.startedAt,
    );
    expect(
      second.text,
    ).toBe(
      first.text,
    );
    expect(
      rows(),
    ).toHaveLength(
      1,
    );
    // A reload mid-run still reports the original clock.
    expect(
      (
        await getDaily(
          'u1',
          at(
            6 *
              60_000,
          ),
        )
      )
        .startedAt,
    ).toBe(
      first.startedAt,
    );
  });
});

describe('finish', () => {
  it('uses the server clock, not anything the client says', async () => {
    await startDaily(
      'u1',
      T0,
    );
    // The body schema has no time field at all: an extra one is stripped.
    const parsed =
      dailyFinishBody.parse(
        {
          ...clean,
          elapsedMs: 1,
        },
      );
    expect(
      'elapsedMs' in
        parsed,
    ).toBe(
      false,
    );
    const out =
      await finishDaily(
        'u1',
        parsed,
        at(
          60_000,
        ),
      );
    expect(
      out.kind,
    ).toBe(
      'state',
    );
    if (
      out.kind !==
      'state'
    )
      return;
    expect(
      out
        .state
        .status,
    ).toBe(
      'done',
    );
    expect(
      out
        .state
        .result
        ?.timeMs,
    ).toBe(
      60_000,
    );
    expect(
      out
        .state
        .result
        ?.wpm,
    ).toBe(
      Math.round(
        (L /
          5) *
          10,
      ) /
        10,
    );
    expect(
      out
        .state
        .result
        ?.rank,
    ).toBe(
      1,
    );
    expect(
      out
        .state
        .streak,
    ).toBe(
      1,
    );
    expect(
      db.invalidated,
    ).toEqual(
      [
        `rmhtype-daily:${DAY}`,
      ],
    );
  });

  it('rejects a claimed 400 wpm and stores nothing', async () => {
    await startDaily(
      'u1',
      T0,
    );
    // The characters of the passage in the time 400 wpm would take.
    const ms =
      Math.round(
        (L /
          5 /
          400) *
          60_000,
      );
    expect(
      await finishDaily(
        'u1',
        clean,
        at(
          ms,
        ),
      ),
    ).toEqual(
      {
        kind: 'implausible',
      },
    );
    // The attempt is closed without a score, so the UI cannot offer a retry that fails again.
    expect(
      rows()[0]
        ?.finishedAt,
    ).not.toBeNull();
    expect(
      rows()[0]
        ?.wpm,
    ).toBeNull();
    expect(
      (
        await getDaily(
          'u1',
          at(
            ms,
          ),
        )
      )
        .status,
    ).toBe(
      'missed',
    );
    expect(
      await finishDaily(
        'u1',
        clean,
        at(
          ms,
        ),
      ),
    ).toEqual(
      {
        kind: 'already-finished',
      },
    );
  });

  it('rejects counts that cannot match the passage', async () => {
    await startDaily(
      'u1',
      T0,
    );
    expect(
      await finishDaily(
        'u1',
        {
          ...clean,
          total: 3,
          correct: 3,
        },
        at(
          60_000,
        ),
      ),
    ).toEqual(
      {
        kind: 'implausible',
      },
    );
    db.rows =
      [];
    await startDaily(
      'u1',
      T0,
    );
    expect(
      await finishDaily(
        'u1',
        {
          ...clean,
          correct:
            L +
            1,
        },
        at(
          60_000,
        ),
      ),
    ).toEqual(
      {
        kind: 'implausible',
      },
    );
  });

  it('accepts a result once', async () => {
    await startDaily(
      'u1',
      T0,
    );
    expect(
      (
        await finishDaily(
          'u1',
          clean,
          at(
            60_000,
          ),
        )
      )
        .kind,
    ).toBe(
      'state',
    );
    expect(
      await finishDaily(
        'u1',
        clean,
        at(
          90_000,
        ),
      ),
    ).toEqual(
      {
        kind: 'already-finished',
      },
    );
    expect(
      rows()[0]
        ?.timeMs,
    ).toBe(
      60_000,
    );
  });

  it('requires a start', async () => {
    expect(
      await finishDaily(
        'u1',
        clean,
        at(
          60_000,
        ),
      ),
    ).toEqual(
      {
        kind: 'not-started',
      },
    );
  });

  it('stores finishedAt but no score after fifteen minutes', async () => {
    await startDaily(
      'u1',
      T0,
    );
    const out =
      await finishDaily(
        'u1',
        clean,
        at(
          DAILY_WINDOW_MS +
            1_000,
        ),
      );
    expect(
      out.kind,
    ).toBe(
      'state',
    );
    if (
      out.kind !==
      'state'
    )
      return;
    expect(
      out
        .state
        .status,
    ).toBe(
      'missed',
    );
    expect(
      out
        .state
        .result,
    ).toBeNull();
    expect(
      rows()[0]
        ?.finishedAt,
    ).toEqual(
      at(
        DAILY_WINDOW_MS +
          1_000,
      ),
    );
    expect(
      rows()[0]
        ?.wpm,
    ).toBeNull();
    expect(
      out
        .state
        .streak,
    ).toBe(
      0,
    );
    expect(
      await finishDaily(
        'u1',
        clean,
        at(
          DAILY_WINDOW_MS +
            2_000,
        ),
      ),
    ).toEqual(
      {
        kind: 'already-finished',
      },
    );
  });

  it('reports a run left open past the window as missed', async () => {
    await startDaily(
      'u1',
      T0,
    );
    expect(
      (
        await getDaily(
          'u1',
          at(
            DAILY_WINDOW_MS -
              1_000,
          ),
        )
      )
        .status,
    ).toBe(
      'running',
    );
    expect(
      (
        await getDaily(
          'u1',
          at(
            DAILY_WINDOW_MS +
              1_000,
          ),
        )
      )
        .status,
    ).toBe(
      'missed',
    );
  });
});

describe('leaderboard', () => {
  function score(
    userId: string,
    wpm: number,
    accuracy: number,
    finishedMs: number,
  ) {
    rows().push(
      {
        id:
          rows()
            .length +
          1,
        userId,
        day: DAY,
        passageId:
          passage.id,
        startedAt:
          T0,
        finishedAt:
          at(
            finishedMs,
          ),
        wpm,
        accuracy,
        timeMs:
          finishedMs,
      },
    );
  }

  it('ranks by wpm, then accuracy, then the earlier finish', async () => {
    score(
      'slow',
      50,
      99,
      1,
    );
    score(
      'late',
      80,
      97,
      9,
    );
    score(
      'early',
      80,
      97,
      5,
    );
    score(
      'precise',
      80,
      99,
      20,
    );
    const board =
      await getDailyBoard(
        'slow',
        DAY,
        'global',
      );
    expect(
      board.rows.map(
        (
          r,
        ) =>
          r.userId,
      ),
    ).toEqual(
      [
        'precise',
        'early',
        'late',
        'slow',
      ],
    );
    expect(
      board.rows.map(
        (
          r,
        ) =>
          r.rank,
      ),
    ).toEqual(
      [
        1,
        2,
        3,
        4,
      ],
    );
  });

  it('keeps unscored attempts off the board', async () => {
    await startDaily(
      'u1',
      T0,
    );
    expect(
      (
        await getDailyBoard(
          'u1',
          DAY,
          'global',
        )
      )
        .rows,
    ).toEqual(
      [],
    );
  });

  it('shows only the viewer and people they follow in the Friends scope', async () => {
    score(
      'me',
      60,
      95,
      1,
    );
    score(
      'friend',
      70,
      96,
      2,
    );
    score(
      'stranger',
      99,
      99,
      3,
    );
    db.following =
      [
        'friend',
      ];
    const board =
      await getDailyBoard(
        'me',
        DAY,
        'friends',
      );
    expect(
      board.rows.map(
        (
          r,
        ) =>
          r.userId,
      ),
    ).toEqual(
      [
        'friend',
        'me',
      ],
    );
    expect(
      board
        .me
        ?.rank,
    ).toBe(
      2,
    );
  });

  it('returns the viewer row with its true rank when they are outside the top 50', async () => {
    for (
      let i = 0;
      i <
      55;
      i += 1
    )
      score(
        `p${i}`,
        200 -
          i,
        99,
        i,
      );
    score(
      'me',
      10,
      90,
      100,
    );
    const board =
      await getDailyBoard(
        'me',
        DAY,
        'global',
      );
    expect(
      board.rows,
    ).toHaveLength(
      50,
    );
    expect(
      board.me,
    ).toMatchObject(
      {
        userId:
          'me',
        rank: 56,
      },
    );
  });

  it('only keeps a board for today and yesterday', () => {
    expect(
      isBoardDay(
        '20261122',
        T0,
      ),
    ).toBe(
      true,
    );
    expect(
      isBoardDay(
        '20261121',
        T0,
      ),
    ).toBe(
      true,
    );
    expect(
      isBoardDay(
        '20261120',
        T0,
      ),
    ).toBe(
      false,
    );
    expect(
      isBoardDay(
        '20261123',
        T0,
      ),
    ).toBe(
      false,
    );
  });
});
