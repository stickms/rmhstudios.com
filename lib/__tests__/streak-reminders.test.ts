import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {},
  }),
);
vi.mock(
  '@/lib/push/send.server',
  () => ({
    sendPushToUser:
      vi.fn(),
  }),
);

import {
  BATCH_LIMIT,
  DEDUPE_HOURS,
  LOWER_HOURS,
  MIN_STREAK,
  UPPER_HOURS,
  findAtRiskQuery,
  insertAll,
  registerStreakReminderCron,
  reminderPreview,
  reminderPush,
  runStreakSweep,
  streakCron,
  type StreakDb,
} from '../streak-reminders.server';

const quiet =
  {
    error:
      vi.fn(),
    info: vi.fn(),
  };

function targets(
  n: number,
) {
  return Array.from(
    {
      length:
        n,
    },
    (
      _,
      i,
    ) => ({
      userId: `u${i}`,
      current:
        3 +
        (i %
          5),
    }),
  );
}

function fakeDb(
  opts: {
    failBulk?: boolean;
    failUser?: string;
    rows?: unknown[];
  } = {},
) {
  const createMany =
    vi.fn(
      async (_args: {
        data: unknown[];
      }) => {
        if (
          opts.failBulk
        )
          throw new Error(
            'fk violation',
          );
      },
    );
  const create =
    vi.fn(
      async ({
        data,
      }: {
        data: {
          userId: string;
        };
      }) => {
        if (
          data.userId ===
          opts.failUser
        )
          throw new Error(
            'fk violation',
          );
      },
    );
  const queryRaw =
    vi.fn(
      async () =>
        opts.rows ??
        [],
    );
  const db =
    {
      $queryRaw:
        queryRaw,
      notification:
        {
          createMany,
          create,
        },
    } as unknown as StreakDb;
  return {
    db,
    createMany,
    create,
    queryRaw,
  };
}

describe('at-risk predicate', () => {
  it('keeps the Go constants', () => {
    expect(
      [
        MIN_STREAK,
        LOWER_HOURS,
        UPPER_HOURS,
        DEDUPE_HOURS,
        BATCH_LIMIT,
      ],
    ).toEqual(
      [
        3,
        20,
        44,
        20,
        500,
      ],
    );
  });
  it('binds them in the query, with the opt-in and dedupe clauses', () => {
    const q =
      findAtRiskQuery();
    expect(
      q.values,
    ).toEqual(
      [
        3,
        20,
        44,
        'streak_reminder',
        20,
        500,
      ],
    );
    expect(
      q.sql,
    ).toContain(
      'np.system IS NULL OR np.system = true',
    );
    expect(
      q.sql,
    ).toContain(
      `"lastCheckIn" < now() - make_interval(hours => ?::int)`,
    );
    expect(
      q.sql,
    ).toContain(
      `"lastCheckIn" > now() - make_interval(hours => ?::int)`,
    );
    expect(
      q.sql,
    ).toContain(
      'NOT EXISTS',
    );
    expect(
      q.sql,
    ).toContain(
      'LIMIT ?',
    );
  });
});

describe('text and schedule', () => {
  it('uses the exact notification preview and push payload', () => {
    expect(
      reminderPreview(
        7,
      ),
    ).toBe(
      'Your 7-day streak is about to end — check in to keep it alive!',
    );
    expect(
      reminderPush(
        7,
      ),
    ).toEqual(
      {
        title:
          'Keep your streak alive 🔥',
        body: 'Your 7-day streak ends soon — check in to keep it going.',
        url: '/progress',
        tag: 'streak-reminder',
      },
    );
  });
  it('maps the interval env to a cron, hourly by default', () => {
    expect(
      streakCron(
        undefined,
      ),
    ).toBe(
      '23 * * * *',
    );
    expect(
      streakCron(
        'nonsense',
      ),
    ).toBe(
      '23 * * * *',
    );
    expect(
      streakCron(
        '60',
      ),
    ).toBe(
      '23 * * * *',
    );
    expect(
      streakCron(
        '30',
      ),
    ).toBe(
      '*/30 * * * *',
    );
    expect(
      streakCron(
        '180',
      ),
    ).toBe(
      '23 */3 * * *',
    );
  });
});

describe('insertAll', () => {
  it('writes a full sweep as ONE createMany with the Go row shape', async () => {
    const {
      db,
      createMany,
      create,
    } =
      fakeDb();
    const got =
      await insertAll(
        db,
        targets(
          BATCH_LIMIT,
        ),
        quiet,
      );
    expect(
      got,
    ).toHaveLength(
      BATCH_LIMIT,
    );
    expect(
      createMany,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      create,
    ).not.toHaveBeenCalled();
    expect(
      createMany
        .mock
        .calls[0][0]
        .data[0],
    ).toEqual(
      {
        userId:
          'u0',
        type: 'SYSTEM',
        entityType:
          'streak_reminder',
        entityId:
          '3',
        preview:
          reminderPreview(
            3,
          ),
        link: '/progress',
        read: false,
      },
    );
  });
  it('falls back per user and loses only the bad row', async () => {
    const ts =
      targets(
        10,
      );
    const {
      db,
      createMany,
      create,
    } =
      fakeDb(
        {
          failBulk: true,
          failUser:
            ts[3]
              .userId,
        },
      );
    const got =
      await insertAll(
        db,
        ts,
        quiet,
      );
    expect(
      got,
    ).toHaveLength(
      9,
    );
    expect(
      got.find(
        (
          r,
        ) =>
          r.userId ===
          ts[3]
            .userId,
      ),
    ).toBeUndefined();
    expect(
      createMany,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      create,
    ).toHaveBeenCalledTimes(
      10,
    );
  });
  it('does not touch the database for an empty sweep', async () => {
    const {
      db,
      createMany,
    } =
      fakeDb();
    expect(
      await insertAll(
        db,
        [],
        quiet,
      ),
    ).toEqual(
      [],
    );
    expect(
      createMany,
    ).not.toHaveBeenCalled();
  });
});

describe('runStreakSweep', () => {
  it('pushes only the reminders that landed, with the payload', async () => {
    const {
      db,
    } =
      fakeDb(
        {
          rows: [
            {
              userId:
                'a',
              current: 4,
            },
            {
              userId:
                'b',
              current:
                BigInt(
                  9,
                ),
            },
          ],
          failBulk: true,
          failUser:
            'b',
        },
      );
    const push =
      vi.fn(
        async () =>
          undefined,
      );
    const r =
      await runStreakSweep(
        {
          db,
          push,
          log: quiet,
        },
      );
    expect(
      r,
    ).toEqual(
      {
        candidates: 2,
        reminded: 1,
      },
    );
    expect(
      push,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      push,
    ).toHaveBeenCalledWith(
      'a',
      reminderPush(
        4,
      ),
    );
  });
  it('throws when the at-risk query fails, so the job is not a success', async () => {
    const {
      db,
      queryRaw,
    } =
      fakeDb();
    queryRaw.mockRejectedValueOnce(
      new Error(
        'down',
      ),
    );
    await expect(
      runStreakSweep(
        {
          db,
          push: vi.fn(),
          log: quiet,
        },
      ),
    ).rejects.toThrow(
      'down',
    );
  });
  it('a push failure never fails the sweep', async () => {
    const {
      db,
    } =
      fakeDb(
        {
          rows: [
            {
              userId:
                'a',
              current: 3,
            },
          ],
        },
      );
    const push =
      vi.fn(
        async () => {
          throw new Error(
            'push down',
          );
        },
      );
    await expect(
      runStreakSweep(
        {
          db,
          push,
          log: quiet,
        },
      ),
    ).resolves.toEqual(
      {
        candidates: 1,
        reminded: 1,
      },
    );
  });
});

describe('registration', () => {
  const boss =
    () => ({
      createQueue:
        vi.fn(
          async () =>
            undefined,
        ),
      schedule:
        vi.fn(
          async () =>
            undefined,
        ),
      work: vi.fn(
        async () =>
          undefined,
      ),
    });
  it('is skipped when STREAK_REMINDER_ENABLED=false', async () => {
    vi.stubEnv(
      'STREAK_REMINDER_ENABLED',
      'false',
    );
    const b =
      boss();
    await registerStreakReminderCron(
      b,
    );
    expect(
      b.createQueue,
    ).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
  it('creates an exclusive queue and schedules the hourly cron', async () => {
    vi.stubEnv(
      'STREAK_REMINDER_ENABLED',
      '',
    );
    vi.stubEnv(
      'STREAK_REMINDER_INTERVAL_MINUTES',
      '',
    );
    const b =
      boss();
    await registerStreakReminderCron(
      b,
    );
    expect(
      b.createQueue,
    ).toHaveBeenCalledWith(
      'streak.reminder-sweep',
      {
        policy:
          'exclusive',
      },
    );
    expect(
      b.schedule,
    ).toHaveBeenCalledWith(
      'streak.reminder-sweep',
      '23 * * * *',
      {},
      {
        tz: 'UTC',
      },
    );
    expect(
      b.work,
    ).toHaveBeenCalledTimes(
      1,
    );
    vi.unstubAllEnvs();
  });
});
