import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const db =
  vi.hoisted(
    () => ({
      queryRaw:
        vi.fn(),
      aggregate:
        vi.fn(),
      findUnique:
        vi.fn(),
      findMany:
        vi.fn(),
      upsert:
        vi.fn(),
    }),
  );

vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {
        $queryRaw:
          db.queryRaw,
        rmhStudySession:
          {
            aggregate:
              db.aggregate,
            findMany:
              db.findMany,
          },
        rmhStudyProfile:
          {
            findUnique:
              db.findUnique,
            upsert:
              db.upsert,
          },
      },
  }),
);

import {
  goalBody,
  historyQuery,
  sessionsQuery,
} from '@/lib/rmhstudy/history-schema';
import {
  getFocusHistory,
  listFocusSessions,
  setWeeklyGoal,
} from '@/lib/rmhstudy/history.server';

beforeEach(
  () => {
    vi.clearAllMocks();
    db.queryRaw.mockResolvedValue(
      [],
    );
    db.aggregate.mockResolvedValue(
      {
        _max: {
          focusTimeMs:
            null,
        },
        _count:
          {
            _all: 0,
          },
      },
    );
    db.findUnique.mockResolvedValue(
      null,
    );
    db.findMany.mockResolvedValue(
      [],
    );
    db.upsert.mockResolvedValue(
      {
        weeklyGoalMinutes:
          null,
      },
    );
  },
);

describe('weekly goal bounds', () => {
  it('accepts 30 to 3,000 minutes and null', () => {
    for (const minutes of [
      30,
      360,
      3000,
      null,
    ]) {
      expect(
        goalBody.safeParse(
          {
            minutes,
          },
        )
          .success,
      ).toBe(
        true,
      );
    }
  });

  it('rejects out-of-range, fractional and non-numeric goals', () => {
    for (const minutes of [
      0,
      29,
      3001,
      -60,
      90.5,
      '360',
      undefined,
      NaN,
    ]) {
      expect(
        goalBody.safeParse(
          {
            minutes,
          },
        )
          .success,
      ).toBe(
        false,
      );
    }
  });

  it('bounds the week offset, first day and cursor', () => {
    expect(
      historyQuery.safeParse(
        {
          weekOffset:
            '7',
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      historyQuery.safeParse(
        {
          weekOffset:
            '8',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      historyQuery.safeParse(
        {
          weekOffset:
            '-1',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      historyQuery.safeParse(
        {
          firstDay:
            '7',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      sessionsQuery.safeParse(
        {
          cursor:
            '1763000000000.cmabc123',
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      sessionsQuery.safeParse(
        {
          cursor:
            "1'; DROP TABLE x;--",
        },
      )
        .success,
    ).toBe(
      false,
    );
  });

  it('stores the goal on the caller own profile, creating it when missing', async () => {
    db.upsert.mockResolvedValue(
      {
        weeklyGoalMinutes: 360,
      },
    );
    await expect(
      setWeeklyGoal(
        'user-1',
        360,
      ),
    ).resolves.toBe(
      360,
    );
    expect(
      db.upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining(
        {
          where:
            {
              userId:
                'user-1',
            },
          create:
            {
              userId:
                'user-1',
              weeklyGoalMinutes: 360,
            },
          update:
            {
              weeklyGoalMinutes: 360,
            },
        },
      ),
    );
  });

  it('clears the goal with null', async () => {
    await expect(
      setWeeklyGoal(
        'user-1',
        null,
      ),
    ).resolves.toBeNull();
    expect(
      db
        .upsert
        .mock
        .calls[0]?.[0]
        .update,
    ).toEqual(
      {
        weeklyGoalMinutes:
          null,
      },
    );
  });
});

describe('history is scoped to the session user', () => {
  it('filters every aggregate by userId, with the time zone as a bound value', async () => {
    await getFocusHistory(
      'user-1',
      {
        timeZone:
          'America/New_York',
        weekOffset: 0,
        firstDay: 1,
      },
    );

    expect(
      db.queryRaw,
    ).toHaveBeenCalledTimes(
      1,
    );
    const [
      strings,
      ...values
    ] =
      db
        .queryRaw
        .mock
        .calls[0] as [
        string[],
        ...unknown[],
      ];
    const sql =
      strings.join(
        '?',
      );
    expect(
      sql,
    ).toContain(
      '"userId" = ',
    );
    expect(
      sql,
    ).toContain(
      '"startedAt"',
    );
    expect(
      sql,
    ).not.toContain(
      'America/New_York',
    );
    expect(
      values,
    ).toContain(
      'user-1',
    );
    expect(
      values,
    ).toContain(
      'America/New_York',
    );

    expect(
      db
        .aggregate
        .mock
        .calls[0]?.[0]
        .where,
    ).toEqual(
      {
        userId:
          'user-1',
      },
    );
    expect(
      db
        .findUnique
        .mock
        .calls[0]?.[0]
        .where,
    ).toEqual(
      {
        userId:
          'user-1',
      },
    );
  });

  it('scopes the sessions list to the user, on every page', async () => {
    await listFocusSessions(
      'user-1',
      undefined,
    );
    await listFocusSessions(
      'user-1',
      '1763000000000.abc',
    );
    for (const call of db
      .findMany
      .mock
      .calls)
      expect(
        call[0]
          .where
          .userId,
      ).toBe(
        'user-1',
      );
  });

  it('builds the history from the rows and the profile', async () => {
    const today =
      new Date()
        .toISOString()
        .slice(
          0,
          10,
        );
    db.queryRaw.mockResolvedValue(
      [
        {
          day: today,
          minutes: 25,
        },
      ],
    );
    db.aggregate.mockResolvedValue(
      {
        _max: {
          focusTimeMs:
            25 *
            60_000,
        },
        _count:
          {
            _all: 1,
          },
      },
    );
    db.findUnique.mockResolvedValue(
      {
        weeklyGoalMinutes: 360,
        currentStreak: 3,
        longestStreak: 9,
      },
    );

    const h =
      await getFocusHistory(
        'user-1',
        {
          timeZone:
            'UTC',
          weekOffset: 0,
          firstDay: 1,
        },
      );
    expect(
      h.thisWeekMinutes,
    ).toBe(
      25,
    );
    expect(
      h.lastWeekMinutes,
    ).toBe(
      0,
    );
    expect(
      h.goalMinutes,
    ).toBe(
      360,
    );
    expect(
      h.streak,
    ).toEqual(
      {
        current: 3,
        longest: 9,
      },
    );
    expect(
      h.week.days.find(
        (
          d,
        ) =>
          d.date ===
          today,
      )
        ?.minutes,
    ).toBe(
      25,
    );
    expect(
      h.records,
    ).toMatchObject(
      {
        longestRunMinutes: 25,
        totalSessions: 1,
      },
    );
  });
});

describe('sessions list paging', () => {
  const row =
    (
      n: number,
    ) => ({
      id: `s${String(n).padStart(3, '0')}`,
      startedAt:
        new Date(
          1_763_000_000_000 -
            n *
              1000,
        ),
      focusTimeMs:
        25 *
        60_000,
      breakTimeMs: 0,
      sessionsInRun: 1,
      roomId:
        null,
    });

  it('returns 20 rows and a cursor for the next page when more exist', async () => {
    db.findMany.mockResolvedValue(
      Array.from(
        {
          length: 21,
        },
        (
          _,
          i,
        ) =>
          row(
            i,
          ),
      ),
    );
    const page =
      await listFocusSessions(
        'user-1',
        undefined,
      );
    expect(
      page.sessions,
    ).toHaveLength(
      20,
    );
    expect(
      page.nextCursor,
    ).toBe(
      `${row(19).startedAt.getTime()}.${row(19).id}`,
    );
    expect(
      db
        .findMany
        .mock
        .calls[0]?.[0]
        .take,
    ).toBe(
      21,
    );
  });

  it('ends without a cursor and resumes strictly after the cursor row', async () => {
    db.findMany.mockResolvedValue(
      [
        row(
          20,
        ),
      ],
    );
    const page =
      await listFocusSessions(
        'user-1',
        `${row(19).startedAt.getTime()}.${row(19).id}`,
      );
    expect(
      page.nextCursor,
    ).toBeNull();
    expect(
      db
        .findMany
        .mock
        .calls[0]?.[0]
        .where
        .OR,
    ).toEqual(
      [
        {
          startedAt:
            {
              lt: row(
                19,
              )
                .startedAt,
            },
        },
        {
          startedAt:
            row(
              19,
            )
              .startedAt,
          id: {
            lt: row(
              19,
            )
              .id,
          },
        },
      ],
    );
    expect(
      db
        .findMany
        .mock
        .calls[0]?.[0]
        .orderBy,
    ).toEqual(
      [
        {
          startedAt:
            'desc',
        },
        {
          id: 'desc',
        },
      ],
    );
  });
});
