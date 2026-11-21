import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  progressQuery,
  progressRunsQuery,
} from '@/lib/rmhtype/progress-schema';
import {
  getProgress,
  getRuns,
} from '@/lib/rmhtype/progress.server';

// A member's typing history is theirs alone: every query is keyed on the session
// user's id, and the viewer's time zone and cursor are validated before they reach SQL.

const db =
  vi.hoisted(
    () => ({
      findMany:
        vi.fn(),
      queryRaw:
        vi.fn(),
    }),
  );

vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {
        rmhTypeMatchPlayer:
          {
            findMany:
              db.findMany,
          },
        $queryRaw:
          db.queryRaw,
      },
  }),
);

beforeEach(
  () => {
    db.findMany
      .mockReset()
      .mockResolvedValue(
        [],
      );
    db.queryRaw
      .mockReset()
      .mockResolvedValue(
        [],
      );
  },
);

describe('progress queries are scoped to the session user', () => {
  it("reads only the caller's rows for the summary, the daily buckets and the bests", async () => {
    await getProgress(
      'user-a',
      {
        range:
          '90d',
        mode: 'races',
        tz: 'Europe/Paris',
      },
    );

    expect(
      db.findMany,
    ).toHaveBeenCalledTimes(
      1,
    );
    const arg =
      db
        .findMany
        .mock
        .calls[0]?.[0] as {
        where: {
          userId: string;
          match: unknown;
        };
        take: number;
      };
    expect(
      arg
        .where
        .userId,
    ).toBe(
      'user-a',
    );
    expect(
      arg
        .where
        .match,
    ).toEqual(
      {
        isSolo: false,
      },
    );
    expect(
      arg.take,
    ).toBe(
      5000,
    );

    expect(
      db.queryRaw,
    ).toHaveBeenCalledTimes(
      2,
    );
    for (const call of db
      .queryRaw
      .mock
      .calls) {
      const [
        strings,
        ...values
      ] =
        call as [
          string[],
          ...unknown[],
        ];
      expect(
        strings.join(
          '?',
        ),
      ).toContain(
        '"userId" = ?',
      );
      expect(
        values,
      ).toContain(
        'user-a',
      );
      expect(
        values,
      ).toContain(
        5000,
      );
    }
  });

  it("never puts another member's id into any query", async () => {
    await getProgress(
      'user-a',
      {
        range:
          'all',
        mode: 'all',
        tz: 'UTC',
      },
    );
    await getRuns(
      'user-a',
      {
        mode: 'solo',
      },
    );
    const everything =
      JSON.stringify(
        [
          db
            .findMany
            .mock
            .calls,
          db
            .queryRaw
            .mock
            .calls,
        ],
      );
    expect(
      everything,
    ).not.toContain(
      'user-b',
    );
    expect(
      everything,
    ).toContain(
      'user-a',
    );
  });

  it('scopes the run list to the caller, newest first, with one extra row to detect a next page', async () => {
    await getRuns(
      'user-a',
      {
        mode: 'solo',
        cursor:
          '2026-11-01T10:00:00.000Z~run-9',
      },
    );
    const arg =
      db
        .findMany
        .mock
        .calls[0]?.[0] as {
        where: {
          userId: string;
          match: unknown;
          OR: unknown[];
        };
        take: number;
        orderBy: unknown;
      };
    expect(
      arg
        .where
        .userId,
    ).toBe(
      'user-a',
    );
    expect(
      arg
        .where
        .match,
    ).toEqual(
      {
        isSolo: true,
      },
    );
    expect(
      arg
        .where
        .OR,
    ).toHaveLength(
      2,
    );
    expect(
      arg.take,
    ).toBe(
      26,
    );
    expect(
      arg.orderBy,
    ).toEqual(
      [
        {
          createdAt:
            'desc',
        },
        {
          id: 'desc',
        },
      ],
    );
  });

  it('returns 25 runs and a cursor when a further page exists, and hides rank for solo runs', async () => {
    const row =
      (
        i: number,
        solo: boolean,
      ) => ({
        id: `r${i}`,
        createdAt:
          new Date(
            Date.UTC(
              2026,
              10,
              1,
              0,
              0,
              60 -
                i,
            ),
          ),
        wpm: 60,
        accuracy: 96,
        rank: 2,
        match:
          {
            isSolo:
              solo,
            passageLength:
              'short',
            difficulty:
              'easy',
          },
      });
    db.findMany.mockResolvedValue(
      Array.from(
        {
          length: 26,
        },
        (
          _,
          i,
        ) =>
          row(
            i,
            i ===
              0,
          ),
      ),
    );
    const page =
      await getRuns(
        'user-a',
        {
          mode: 'all',
        },
      );
    expect(
      page.runs,
    ).toHaveLength(
      25,
    );
    expect(
      page
        .runs[0]
        ?.rank,
    ).toBeNull();
    expect(
      page
        .runs[1]
        ?.rank,
    ).toBe(
      2,
    );
    expect(
      page.nextCursor,
    ).toContain(
      '~r24',
    );
  });

  it('has no next page when 25 or fewer rows come back', async () => {
    db.findMany.mockResolvedValue(
      [],
    );
    expect(
      (
        await getRuns(
          'user-a',
          {
            mode: 'all',
          },
        )
      )
        .nextCursor,
    ).toBeNull();
  });
});

describe('progress query validation', () => {
  it('accepts a known range, mode and IANA zone', () => {
    expect(
      progressQuery.safeParse(
        {
          range:
            '30d',
          mode: 'all',
          tz: 'America/New_York',
        },
      )
        .success,
    ).toBe(
      true,
    );
  });

  it('rejects an unknown zone, range or mode before any SQL runs', () => {
    expect(
      progressQuery.safeParse(
        {
          range:
            '30d',
          mode: 'all',
          tz: "UTC'; DROP TABLE x",
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      progressQuery.safeParse(
        {
          range:
            '7d',
          mode: 'all',
          tz: 'UTC',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      progressQuery.safeParse(
        {
          range:
            '30d',
          mode: 'friends',
          tz: 'UTC',
        },
      )
        .success,
    ).toBe(
      false,
    );
  });

  it('rejects a malformed run cursor', () => {
    expect(
      progressRunsQuery.safeParse(
        {
          mode: 'all',
          cursor:
            'junk',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      progressRunsQuery.safeParse(
        {
          mode: 'all',
          cursor:
            '2026-11-01T10:00:00.000Z~abc',
        },
      )
        .success,
    ).toBe(
      true,
    );
  });
});
