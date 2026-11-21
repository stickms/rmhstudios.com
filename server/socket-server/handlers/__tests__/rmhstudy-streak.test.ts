import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

interface Profile {
  id: string;
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: Date | null;
  timeZone:
    | string
    | null;
}

const store =
  vi.hoisted(
    () => ({
      profiles:
        new Map<
          string,
          unknown
        >(),
      sessions:
        [] as unknown[],
    }),
  );

vi.mock(
  '../../prisma-client',
  () => ({
    getPrismaClient:
      () => ({
        rmhStudyProfile:
          {
            findUnique:
              async ({
                where,
              }: {
                where: {
                  userId: string;
                };
              }) =>
                store.profiles.get(
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
                create: Record<
                  string,
                  unknown
                >;
                update: Record<
                  string,
                  unknown
                >;
              }) => {
                const existing =
                  store.profiles.get(
                    where.userId,
                  ) as
                    | Profile
                    | undefined;
                const base =
                  {
                    id: `p-${where.userId}`,
                    currentStreak: 0,
                    longestStreak: 0,
                    lastStudyDate:
                      null,
                    timeZone:
                      null,
                  };
                const next =
                  existing
                    ? {
                        ...existing,
                        ...stripIncrements(
                          update,
                        ),
                      }
                    : {
                        ...base,
                        userId:
                          where.userId,
                        ...stripIncrements(
                          create,
                        ),
                      };
                store.profiles.set(
                  where.userId,
                  next,
                );
                return next;
              },
          },
        rmhStudySession:
          {
            create:
              async ({
                data,
              }: {
                data: unknown;
              }) =>
                store.sessions.push(
                  data,
                ),
          },
      }),
  }),
);
vi.mock(
  '../../economy',
  () => ({
    awardAppProgress:
      vi.fn(),
  }),
);

function stripIncrements(
  data: Record<
    string,
    unknown
  >,
): Record<
  string,
  unknown
> {
  return Object.fromEntries(
    Object.entries(
      data,
    ).filter(
      ([
        ,
        v,
      ]) =>
        typeof v !==
          'object' ||
        v instanceof
          Date ||
        v ===
          null,
    ),
  );
}

import {
  persistMemberWorkSession,
  rememberTimeZone,
  validTimeZone,
} from '../rmhstudy';

describe('validTimeZone', () => {
  it('accepts an IANA zone and rejects everything else', () => {
    expect(
      validTimeZone(
        'America/New_York',
      ),
    ).toBe(
      'America/New_York',
    );
    expect(
      validTimeZone(
        'Not/AZone',
      ),
    ).toBeNull();
    expect(
      validTimeZone(
        '',
      ),
    ).toBeNull();
    expect(
      validTimeZone(
        42,
      ),
    ).toBeNull();
    expect(
      validTimeZone(
        undefined,
      ),
    ).toBeNull();
    expect(
      validTimeZone(
        `${'a'.repeat(41)}`,
      ),
    ).toBeNull();
  });
});

describe('rememberTimeZone', () => {
  beforeEach(
    () =>
      store.profiles.clear(),
  );

  it('stores a valid zone on the profile', async () => {
    await rememberTimeZone(
      'u1',
      'America/New_York',
    );
    expect(
      (
        store.profiles.get(
          'u1',
        ) as Profile
      )
        .timeZone,
    ).toBe(
      'America/New_York',
    );
  });

  it('stores nothing for an invalid zone', async () => {
    await rememberTimeZone(
      'u1',
      'Mars/Olympus',
    );
    await rememberTimeZone(
      'u1',
      {
        toString:
          () =>
            'UTC',
      },
    );
    expect(
      store.profiles.has(
        'u1',
      ),
    ).toBe(
      false,
    );
  });
});

describe('persistMemberWorkSession streak', () => {
  beforeEach(
    () => {
      store.profiles.clear();
      store.sessions.length = 0;
      vi.useFakeTimers();
    },
  );

  it('gives two 21:00 sessions on consecutive New York evenings a streak of 2', async () => {
    await rememberTimeZone(
      'u1',
      'America/New_York',
    );
    // 21:00 New York is 02:00 UTC the next day, so UTC alone would call both evenings
    // the same or a skipped day.
    vi.setSystemTime(
      new Date(
        '2026-11-18T02:00:00Z',
      ),
    );
    await persistMemberWorkSession(
      'u1',
      'ROOM',
      25 *
        60_000,
      1,
    );
    expect(
      (
        store.profiles.get(
          'u1',
        ) as Profile
      )
        .currentStreak,
    ).toBe(
      1,
    );
    vi.setSystemTime(
      new Date(
        '2026-11-19T02:00:00Z',
      ),
    );
    await persistMemberWorkSession(
      'u1',
      'ROOM',
      25 *
        60_000,
      1,
    );
    const profile =
      store.profiles.get(
        'u1',
      ) as Profile;
    expect(
      profile.currentStreak,
    ).toBe(
      2,
    );
    expect(
      profile.longestStreak,
    ).toBe(
      2,
    );
    vi.useRealTimers();
  });

  it('counts days in UTC for a member with no stored zone', async () => {
    vi.setSystemTime(
      new Date(
        '2026-11-18T23:30:00Z',
      ),
    );
    await persistMemberWorkSession(
      'u2',
      'ROOM',
      25 *
        60_000,
      1,
    );
    vi.setSystemTime(
      new Date(
        '2026-11-19T00:30:00Z',
      ),
    );
    await persistMemberWorkSession(
      'u2',
      'ROOM',
      25 *
        60_000,
      1,
    );
    expect(
      (
        store.profiles.get(
          'u2',
        ) as Profile
      )
        .currentStreak,
    ).toBe(
      2,
    );
    vi.useRealTimers();
  });
});
