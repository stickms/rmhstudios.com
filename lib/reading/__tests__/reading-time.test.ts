import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/** An in-memory slice of Prisma; `$executeRaw` (the advisory lock) really serialises per key. */
interface DayRow {
  userId: string;
  day: string;
  docKind: string;
  docKey: string;
  seconds: number;
}
const db =
  vi.hoisted(
    () => ({
      prefs:
        new Map<
          string,
          {
            trackTime: boolean;
            weeklyMinutesTarget:
              | number
              | null;
          }
        >(),
      rows: [] as DayRow[],
      locks:
        new Map<
          string,
          Promise<void>
        >(),
      lockWaits: 0,
    }),
  );

vi.mock(
  '@/lib/reading/highlights.server',
  () => ({
    docExists:
      vi.fn(
        async (
          _k: string,
          key: string,
        ) =>
          key !==
          'missing',
      ),
  }),
);
vi.mock(
  '@/lib/library/library.server',
  () => ({
    getBook:
      vi.fn(
        async (
          slug: string,
        ) =>
          slug ===
          'moby'
            ? {
                slug,
                title:
                  'Moby-Dick',
              }
            : undefined,
      ),
  }),
);

vi.mock(
  '@/lib/prisma.server',
  () => {
    const match =
      (
        r: DayRow,
        where: Record<
          string,
          unknown
        >,
      ): boolean =>
        Object.entries(
          where,
        ).every(
          ([
            k,
            v,
          ]) => {
            const val =
              r[
                k as keyof DayRow
              ];
            if (
              v !==
                null &&
              typeof v ===
                'object'
            ) {
              const o =
                v as {
                  gte?: string;
                  lte?: string;
                };
              return (
                (o.gte ===
                  undefined ||
                  String(
                    val,
                  ) >=
                    o.gte) &&
                (o.lte ===
                  undefined ||
                  String(
                    val,
                  ) <=
                    o.lte)
              );
            }
            return (
              val ===
              v
            );
          },
        );
    const readingTimeDay =
      {
        aggregate:
          async ({
            where,
          }: {
            where: Record<
              string,
              unknown
            >;
          }) => {
            await Promise.resolve();
            await Promise.resolve();
            return {
              _sum: {
                seconds:
                  db.rows
                    .filter(
                      (
                        r,
                      ) =>
                        match(
                          r,
                          where,
                        ),
                    )
                    .reduce(
                      (
                        n,
                        r,
                      ) =>
                        n +
                        r.seconds,
                      0,
                    ),
              },
            };
          },
        upsert:
          async ({
            where,
            create,
            update,
          }: {
            where: {
              userId_day_docKind_docKey: Omit<
                DayRow,
                'seconds'
              >;
            };
            create: DayRow;
            update: {
              seconds: {
                increment: number;
              };
            };
          }) => {
            const k =
              where.userId_day_docKind_docKey;
            const row =
              db.rows.find(
                (
                  r,
                ) =>
                  r.userId ===
                    k.userId &&
                  r.day ===
                    k.day &&
                  r.docKind ===
                    k.docKind &&
                  r.docKey ===
                    k.docKey,
              );
            if (
              row
            )
              row.seconds +=
                update.seconds.increment;
            else
              db.rows.push(
                {
                  ...create,
                },
              );
          },
        groupBy:
          async ({
            by,
            where,
            take,
          }: {
            by: Array<
              keyof DayRow
            >;
            where: Record<
              string,
              unknown
            >;
            take?: number;
          }) => {
            const groups =
              new Map<
                string,
                Record<
                  string,
                  unknown
                >
              >();
            for (const r of db.rows.filter(
              (
                x,
              ) =>
                match(
                  x,
                  where,
                ),
            )) {
              const key =
                by
                  .map(
                    (
                      b,
                    ) =>
                      r[
                        b
                      ],
                  )
                  .join(
                    '|',
                  );
              const g =
                groups.get(
                  key,
                ) ?? {
                  ...Object.fromEntries(
                    by.map(
                      (
                        b,
                      ) => [
                        b,
                        r[
                          b
                        ],
                      ],
                    ),
                  ),
                  _sum: {
                    seconds: 0,
                  },
                };
              (
                g._sum as {
                  seconds: number;
                }
              ).seconds +=
                r.seconds;
              groups.set(
                key,
                g,
              );
            }
            const out =
              [
                ...groups.values(),
              ].sort(
                (
                  a,
                  b,
                ) =>
                  (
                    b._sum as {
                      seconds: number;
                    }
                  )
                    .seconds -
                  (
                    a._sum as {
                      seconds: number;
                    }
                  )
                    .seconds,
              );
            return take
              ? out.slice(
                  0,
                  take,
                )
              : out;
          },
        deleteMany:
          async ({
            where,
          }: {
            where: Record<
              string,
              unknown
            >;
          }) => {
            db.rows =
              db.rows.filter(
                (
                  r,
                ) =>
                  !match(
                    r,
                    where,
                  ),
              );
          },
        findMany:
          async ({
            where,
          }: {
            where: Record<
              string,
              unknown
            >;
          }) =>
            db.rows.filter(
              (
                r,
              ) =>
                match(
                  r,
                  where,
                ),
            ),
      };
    const readingPrefs =
      {
        findUnique:
          async ({
            where,
          }: {
            where: {
              userId: string;
            };
          }) =>
            db.prefs.get(
              where.userId,
            ) ??
            null,
        upsert:
          async ({
            where,
            create,
            update,
          }: {
            where: {
              userId: string;
            };
            create: {
              trackTime?: boolean;
              weeklyMinutesTarget?:
                | number
                | null;
            };
            update: {
              trackTime?: boolean;
              weeklyMinutesTarget?:
                | number
                | null;
            };
          }) => {
            const cur =
              db.prefs.get(
                where.userId,
              );
            db.prefs.set(
              where.userId,
              {
                trackTime: false,
                weeklyMinutesTarget:
                  null,
                ...(cur ??
                  create),
                ...(cur
                  ? update
                  : {}),
              },
            );
          },
      };
    const prisma =
      {
        readingTimeDay,
        readingPrefs,
        blogPost:
          {
            findMany:
              async () => [
                {
                  slug: 'hello',
                  title:
                    'Hello post',
                },
              ],
          },
        newsArticle:
          {
            findMany:
              async () => [],
          },
        $transaction:
          async (
            cb: (
              tx: unknown,
            ) => Promise<unknown>,
          ) => {
            let release: () => void =
              () => {};
            const done =
              new Promise<void>(
                (
                  r,
                ) =>
                  (release =
                    r),
              );
            const tx =
              {
                readingTimeDay,
                $executeRaw:
                  async (
                    _s: TemplateStringsArray,
                    key: string,
                  ) => {
                    const prev =
                      db.locks.get(
                        key,
                      );
                    db.locks.set(
                      key,
                      done,
                    );
                    if (
                      prev
                    ) {
                      db.lockWaits++;
                      await prev;
                    }
                  },
              };
            try {
              return await cb(
                tx,
              );
            } finally {
              release();
            }
          },
      };
    return {
      prisma,
    };
  },
);

import {
  dayKeyFor,
  deleteReadingTime,
  exportReadingTime,
  setTracking,
  setWeeklyTarget,
  weekStartFor,
} from '@/lib/reading/time.server';
import {
  readingTimeSummary,
  recordReadingTime,
} from '@/lib/reading/time-record.server';

const NOW =
  new Date(
    '2026-11-25T12:00:00Z',
  ); // a Wednesday
const rec =
  (
    seconds: number,
    extra: Partial<
      Parameters<
        typeof recordReadingTime
      >[1]
    > = {},
    now = NOW,
  ) =>
    recordReadingTime(
      'u1',
      {
        kind: 'blog',
        key: 'hello',
        seconds,
        ...extra,
      },
      now,
    );

beforeEach(
  () => {
    db.prefs.clear();
    db.rows =
      [];
    db.locks.clear();
    db.lockWaits = 0;
  },
);

describe('recordReadingTime', () => {
  it('refuses and records nothing while tracking is off', async () => {
    const r =
      await rec(
        60,
      );
    expect(
      r,
    ).toEqual(
      {
        ok: false,
        status: 409,
        error:
          'Reading time is off',
      },
    );
    expect(
      db.rows,
    ).toHaveLength(
      0,
    );
  });

  it('increments the day row for the document', async () => {
    await setTracking(
      'u1',
      true,
    );
    expect(
      await rec(
        60,
      ),
    ).toEqual(
      {
        ok: true,
        recorded: 60,
      },
    );
    expect(
      await rec(
        30,
      ),
    ).toEqual(
      {
        ok: true,
        recorded: 30,
      },
    );
    expect(
      db.rows,
    ).toEqual(
      [
        {
          userId:
            'u1',
          day: '2026-11-25',
          docKind:
            'blog',
          docKey:
            'hello',
          seconds: 90,
        },
      ],
    );
  });

  it('refuses an unknown document', async () => {
    await setTracking(
      'u1',
      true,
    );
    expect(
      await rec(
        60,
        {
          key: 'missing',
        },
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 404,
      },
    );
    expect(
      db.rows,
    ).toHaveLength(
      0,
    );
  });

  it('caps a member’s day at 24 hours in total and drops the excess', async () => {
    await setTracking(
      'u1',
      true,
    );
    db.rows.push(
      {
        userId:
          'u1',
        day: '2026-11-25',
        docKind:
          'news',
        docKey:
          'other',
        seconds:
          86_400 -
          100,
      },
    );
    expect(
      await rec(
        900,
      ),
    ).toEqual(
      {
        ok: true,
        recorded: 100,
      },
    );
    expect(
      await rec(
        900,
      ),
    ).toEqual(
      {
        ok: true,
        recorded: 0,
      },
    );
    const total =
      db.rows.reduce(
        (
          n,
          r,
        ) =>
          n +
          r.seconds,
        0,
      );
    expect(
      total,
    ).toBe(
      86_400,
    );
  });

  it('two concurrent flushes at 23h59m cannot exceed 24 hours (the lock)', async () => {
    await setTracking(
      'u1',
      true,
    );
    db.rows.push(
      {
        userId:
          'u1',
        day: '2026-11-25',
        docKind:
          'news',
        docKey:
          'other',
        seconds:
          86_400 -
          60,
      },
    );
    const [
      a,
      b,
    ] =
      await Promise.all(
        [
          rec(
            900,
          ),
          rec(
            900,
            {
              kind: 'library',
              key: 'moby',
            },
          ),
        ],
      );
    const got =
      [
        a,
        b,
      ].map(
        (
          r,
        ) =>
          r.ok
            ? r.recorded
            : -1,
      );
    expect(
      got.sort(),
    ).toEqual(
      [
        0,
        60,
      ],
    );
    expect(
      db.rows.reduce(
        (
          n,
          r,
        ) =>
          n +
          r.seconds,
        0,
      ),
    ).toBe(
      86_400,
    );
    expect(
      db.lockWaits,
    ).toBe(
      1,
    );
  });

  it('keys the lock to the member and the day: another member is not held up', async () => {
    await setTracking(
      'u1',
      true,
    );
    await Promise.all(
      [
        rec(
          60,
        ),
        rec(
          60,
          {},
          new Date(
            '2026-11-26T12:00:00Z',
          ),
        ),
      ],
    );
    expect(
      db.lockWaits,
    ).toBe(
      0,
    );
  });
});

describe('day keys', () => {
  it('uses the request time zone, UTC when missing or invalid', () => {
    const t =
      new Date(
        '2026-11-25T23:30:00Z',
      );
    expect(
      dayKeyFor(
        t,
        undefined,
      ),
    ).toBe(
      '2026-11-25',
    );
    expect(
      dayKeyFor(
        t,
        'Not/AZone',
      ),
    ).toBe(
      '2026-11-25',
    );
    expect(
      dayKeyFor(
        t,
        'Asia/Tokyo',
      ),
    ).toBe(
      '2026-11-26',
    );
    expect(
      dayKeyFor(
        t,
        'America/Los_Angeles',
      ),
    ).toBe(
      '2026-11-25',
    );
  });

  it('flips at local midnight, so a flush crossing midnight lands on the later day', async () => {
    await setTracking(
      'u1',
      true,
    );
    await rec(
      60,
      {
        tz: 'UTC',
      },
      new Date(
        '2026-11-25T23:59:59Z',
      ),
    );
    await rec(
      60,
      {
        tz: 'UTC',
      },
      new Date(
        '2026-11-26T00:00:00Z',
      ),
    );
    expect(
      db.rows
        .map(
          (
            r,
          ) =>
            r.day,
        )
        .sort(),
    ).toEqual(
      [
        '2026-11-25',
        '2026-11-26',
      ],
    );
  });
});

describe('summary', () => {
  it('starts the week by locale', () => {
    expect(
      weekStartFor(
        '2026-11-25',
        'en-US',
      ),
    ).toBe(
      '2026-11-22',
    ); // Sunday
    expect(
      weekStartFor(
        '2026-11-25',
        'en-GB',
      ),
    ).toBe(
      '2026-11-23',
    ); // Monday
    expect(
      weekStartFor(
        '2026-11-22',
        'en-GB',
      ),
    ).toBe(
      '2026-11-16',
    );
  });

  it('totals this week by day, four previous weeks and the month’s top documents', async () => {
    await setTracking(
      'u1',
      true,
    );
    await setWeeklyTarget(
      'u1',
      150,
    );
    const add =
      (
        day: string,
        docKind: string,
        docKey: string,
        seconds: number,
      ) =>
        db.rows.push(
          {
            userId:
              'u1',
            day,
            docKind,
            docKey,
            seconds,
          },
        );
    add(
      '2026-11-23',
      'blog',
      'hello',
      600,
    ); // Monday this week (en-GB)
    add(
      '2026-11-25',
      'library',
      'moby',
      1900,
    );
    add(
      '2026-11-25',
      'blog',
      'hello',
      300,
    );
    add(
      '2026-11-17',
      'blog',
      'hello',
      900,
    ); // previous week
    add(
      '2026-10-20',
      'blog',
      'hello',
      60,
    ); // 5 weeks back: outside the four
    add(
      '2026-11-24',
      'blog',
      'x-no-title',
      10,
    );
    db.rows.push(
      {
        userId:
          'someone-else',
        day: '2026-11-25',
        docKind:
          'blog',
        docKey:
          'hello',
        seconds: 9999,
      },
    );

    const s =
      await readingTimeSummary(
        'u1',
        {
          tz: 'UTC',
          locale:
            'en-GB',
        },
        NOW,
      );
    expect(
      s.trackTime,
    ).toBe(
      true,
    );
    expect(
      s.weeklyMinutesTarget,
    ).toBe(
      150,
    );
    expect(
      s.weekStart,
    ).toBe(
      '2026-11-23',
    );
    expect(
      s.days.map(
        (
          d,
        ) =>
          d.seconds,
      ),
    ).toEqual(
      [
        600,
        10,
        2200,
        0,
        0,
        0,
        0,
      ],
    );
    expect(
      s.weekSeconds,
    ).toBe(
      2810,
    );
    expect(
      s
        .previousWeeks[0],
    ).toEqual(
      {
        weekStart:
          '2026-11-16',
        seconds: 900,
      },
    );
    expect(
      s.previousWeeks.map(
        (
          w,
        ) =>
          w.seconds,
      ),
    ).toEqual(
      [
        900,
        0,
        0,
        0,
      ],
    );
    expect(
      s.topThisMonth.map(
        (
          d,
        ) => [
          d.title,
          d.seconds,
        ],
      ),
    ).toEqual(
      [
        [
          'Moby-Dick',
          1900,
        ],
        [
          'Hello post',
          1800,
        ],
        [
          'x-no-title',
          10,
        ],
      ],
    );
  });
});

describe('delete and export', () => {
  it('delete removes every row of the member and no one else’s', async () => {
    db.rows.push(
      {
        userId:
          'u1',
        day: '2026-11-25',
        docKind:
          'blog',
        docKey:
          'a',
        seconds: 5,
      },
      {
        userId:
          'u1',
        day: '2026-11-24',
        docKind:
          'news',
        docKey:
          'b',
        seconds: 5,
      },
      {
        userId:
          'u2',
        day: '2026-11-25',
        docKind:
          'blog',
        docKey:
          'a',
        seconds: 5,
      },
    );
    await deleteReadingTime(
      'u1',
    );
    expect(
      db.rows.map(
        (
          r,
        ) =>
          r.userId,
      ),
    ).toEqual(
      [
        'u2',
      ],
    );
  });

  it('exports per-day totals per document and the settings', async () => {
    await setTracking(
      'u1',
      true,
    );
    db.rows.push(
      {
        userId:
          'u1',
        day: '2026-11-25',
        docKind:
          'blog',
        docKey:
          'a',
        seconds: 5,
      },
    );
    expect(
      await exportReadingTime(
        'u1',
      ),
    ).toEqual(
      {
        trackTime: true,
        weeklyMinutesTarget:
          null,
        days: [
          {
            userId:
              'u1',
            day: '2026-11-25',
            docKind:
              'blog',
            docKey:
              'a',
            seconds: 5,
          },
        ],
      },
    );
  });
});
