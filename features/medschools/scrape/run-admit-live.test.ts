import {
  describe,
  expect,
  it,
} from 'vitest';
import { dedupeHash } from '../engine/dedupe';
import {
  PROFILE_FLAG,
  RECENT_UPDATES,
  type AdmitOperation,
} from './adapters/admit/queries';
import {
  runAdmitLive,
  type AdmitLiveDeps,
} from './run-admit-live';
import { ADMIT_GRAPHQL_PATH } from './sources';
import {
  createFakeHost,
  createFakePrisma,
  gqlKey,
} from './test-support';

const SECRET =
  'test-secret-0123456789abcdef';
const NOW =
  new Date(
    '2026-11-20T18:00:00.000Z',
  );
const key =
  (
    op: AdmitOperation,
    vars: Record<
      string,
      unknown
    >,
  ) =>
    gqlKey(
      ADMIT_GRAPHQL_PATH,
      op.operationName,
      vars,
    );
const FEED_KEY =
  key(
    RECENT_UPDATES,
    {
      filterOwnSchools: false,
      slug: 'allSchools',
    },
  );
const flagKey =
  (
    userId: string,
  ) =>
    key(
      PROFILE_FLAG,
      {
        userId,
      },
    );
const flagBody =
  (
    mdPhd:
      | boolean
      | null,
  ) =>
    JSON.stringify(
      {
        data: {
          getCycleTrackProfileByUserId:
            {
              md_phd:
                mdPhd,
            },
        },
      },
    );
const NO_PROFILE =
  JSON.stringify(
    {
      data: {
        getCycleTrackProfileByUserId:
          null,
      },
    },
  );
const ERRORS =
  JSON.stringify(
    {
      errors:
        [
          {
            message:
              'hidden',
          },
        ],
      data: null,
    },
  );

interface Row {
  cycle_update_id: string;
  school: {
    slug: string;
  };
  user_id: string;
  current_status: string;
  current_status_date: string;
}
const row =
  (
    id: string,
    user: string,
    over: Partial<Row> = {},
  ): Row => ({
    cycle_update_id:
      id,
    school:
      {
        slug: 'harvard-medical-school',
      },
    user_id:
      user,
    current_status:
      'ACCEPTED',
    current_status_date:
      '2026-11-20T04:00:00.000Z',
    ...over,
  });
const feedBody =
  (
    rows: Row[],
  ) =>
    JSON.stringify(
      {
        data: {
          getRecentSchoolCycleUpdates:
            rows,
        },
      },
    );
const hash =
  (
    id: string,
  ) =>
    dedupeHash(
      SECRET,
      'ADMIT',
      id,
    );

function setup(
  routes: Record<
    string,
    | string
    | null
  >,
  deps: Partial<AdmitLiveDeps> = {},
  fail = 3,
) {
  const fake =
    createFakePrisma();
  fake.tables.medSchool!.push(
    {
      id: 's1',
      slug: 'harvard',
      active: true,
    },
    {
      id: 's2',
      slug: 'yale',
      active: true,
    },
    {
      id: 's3',
      slug: 'closed',
      active: false,
    },
  );
  fake.tables.medSchoolAlias!.push(
    {
      id: 'a1',
      schoolId:
        's1',
      source:
        'ADMIT',
      sourceKey:
        'harvard-medical-school',
    },
    {
      id: 'a2',
      schoolId:
        's2',
      source:
        'ADMIT',
      sourceKey:
        'yale-school-of-medicine',
    },
    {
      id: 'a3',
      schoolId:
        's3',
      source:
        'ADMIT',
      sourceKey:
        'closed-school',
    },
  );
  const live =
    {
      routes,
    };
  const host =
    createFakeHost(
      (
        p,
      ) =>
        live
          .routes[
          p
        ] ??
        null,
      fail,
    );
  const logs: string[] =
    [];
  const log =
    {
      info: (
        l: string,
      ) =>
        logs.push(
          l,
        ),
      warn: (
        l: string,
      ) =>
        logs.push(
          l,
        ),
      error:
        (
          l: string,
        ) =>
          logs.push(
            l,
          ),
    };
  const run =
    () =>
      runAdmitLive(
        {
          prisma:
            fake.prisma,
          host: host.host,
          secret:
            SECRET,
          shouldStop:
            () =>
              false,
          log,
          now: () =>
            NOW,
          ...deps,
        },
        {
          trigger:
            'MANUAL',
        },
      );
  const events =
    () =>
      fake
        .tables
        .medCycleEvent! as Array<
        Record<
          string,
          unknown
        >
      >;
  const counts =
    () =>
      fake
        .tables
        .medCycleCount! as Array<
        Record<
          string,
          unknown
        >
      >;
  return {
    ...fake,
    ...host,
    live,
    run,
    logs,
    events,
    counts,
  };
}

describe('runAdmitLive', () => {
  it('flagged user → PHD, unflagged → REG, unknown user → null, all stored with the keyed hash', async () => {
    const t =
      setup(
        {
          [FEED_KEY]:
            feedBody(
              [
                row(
                  'c1',
                  'u-phd',
                ),
                row(
                  'c2',
                  'u-reg',
                ),
                row(
                  'c3',
                  'u-gone',
                ),
              ],
            ),
          [flagKey(
            'u-phd',
          )]:
            flagBody(
              true,
            ),
          [flagKey(
            'u-reg',
          )]:
            flagBody(
              null,
            ),
          [flagKey(
            'u-gone',
          )]:
            NO_PROFILE,
        },
      );
    const s =
      await t.run();
    expect(
      s,
    ).toMatchObject(
      {
        status:
          'OK',
        fetched: 3,
        created: 3,
        programNull: 1,
        lookups: 3,
        deferred: 0,
      },
    );
    const byHash =
      new Map(
        t
          .events()
          .map(
            (
              e,
            ) => [
              e.dedupeHash,
              e,
            ],
          ),
      );
    expect(
      byHash.get(
        hash(
          'c1',
        ),
      ),
    ).toMatchObject(
      {
        program:
          'PHD',
        schoolId:
          's1',
        eventType:
          'ACCEPTANCE',
        source:
          'ADMIT',
        inState:
          null,
      },
    );
    expect(
      byHash.get(
        hash(
          'c2',
        ),
      )!
        .program,
    ).toBe(
      'REG',
    );
    expect(
      byHash.get(
        hash(
          'c3',
        ),
      )!
        .program,
    ).toBeNull();
    // only program-labelled events are counted: one PHD and one REG row, none for the null event
    expect(
      t
        .counts()
        .map(
          (
            c,
          ) =>
            c.program,
        )
        .sort(),
    ).toEqual(
      [
        'PHD',
        'REG',
      ],
    );
    expect(
      s.rolledUp,
    ).toBe(
      2,
    );
  });

  it('one lookup per distinct user when a user posts three updates', async () => {
    const t =
      setup(
        {
          [FEED_KEY]:
            feedBody(
              [
                row(
                  'c1',
                  'u1',
                ),
                row(
                  'c2',
                  'u1',
                  {
                    current_status:
                      'INTERVIEW',
                  },
                ),
                row(
                  'c3',
                  'u1',
                  {
                    current_status:
                      'REJECTED',
                  },
                ),
              ],
            ),
          [flagKey(
            'u1',
          )]:
            flagBody(
              true,
            ),
        },
      );
    const s =
      await t.run();
    expect(
      s.lookups,
    ).toBe(
      1,
    );
    expect(
      t.requestedPosts.filter(
        (
          p,
        ) =>
          p.op ===
          PROFILE_FLAG.operationName,
      ),
    ).toHaveLength(
      1,
    );
    expect(
      t
        .events()
        .every(
          (
            e,
          ) =>
            e.program ===
            'PHD',
        ),
    ).toBe(
      true,
    );
  });

  it('second identical run: zero writes and zero profile requests', async () => {
    const t =
      setup(
        {
          [FEED_KEY]:
            feedBody(
              [
                row(
                  'c1',
                  'u1',
                ),
                row(
                  'c2',
                  'u2',
                ),
              ],
            ),
          [flagKey(
            'u1',
          )]:
            flagBody(
              true,
            ),
          [flagKey(
            'u2',
          )]:
            flagBody(
              false,
            ),
        },
      );
    await t.run();
    const data =
      () =>
        JSON.stringify(
          {
            e: t.events(),
            c: t.counts(),
          },
        );
    const before =
      data();
    const writes =
      t
        .writes
        .length;
    const posts =
      t
        .requestedPosts
        .length;
    const s =
      await t.run();
    expect(
      data(),
    ).toBe(
      before,
    );
    // the only writes of the second run are its own run record (create + close)
    expect(
      t
        .writes
        .length -
        writes,
    ).toBe(
      2,
    );
    expect(
      t
        .requestedPosts
        .length -
        posts,
    ).toBe(
      1,
    ); // the feed
    expect(
      s,
    ).toMatchObject(
      {
        status:
          'OK',
        created: 0,
        alreadyStored: 2,
        lookups: 0,
        rolledUp: 0,
      },
    );
  });

  it('profile cache does not persist across runs (a new event from the same user in the next run costs one lookup)', async () => {
    const t =
      setup(
        {
          [FEED_KEY]:
            feedBody(
              [
                row(
                  'c1',
                  'u1',
                ),
              ],
            ),
          [flagKey(
            'u1',
          )]:
            flagBody(
              true,
            ),
        },
      );
    expect(
      (
        await t.run()
      )
        .lookups,
    ).toBe(
      1,
    );
    t.live.routes[
      FEED_KEY
    ] =
      feedBody(
        [
          row(
            'c2',
            'u1',
            {
              current_status:
                'INTERVIEW',
            },
          ),
          row(
            'c1',
            'u1',
          ),
        ],
      );
    const s =
      await t.run();
    expect(
      s,
    ).toMatchObject(
      {
        lookups: 1,
        created: 1,
        alreadyStored: 1,
      },
    );
  });

  it('transient lookup failure defers the event; the next run inserts it with the right program', async () => {
    const t =
      setup(
        {
          [FEED_KEY]:
            feedBody(
              [
                row(
                  'c1',
                  'u1',
                ),
                row(
                  'c2',
                  'u2',
                ),
              ],
            ),
          [flagKey(
            'u1',
          )]:
            ERRORS,
          [flagKey(
            'u2',
          )]:
            flagBody(
              false,
            ),
        },
      );
    const first =
      await t.run();
    expect(
      first,
    ).toMatchObject(
      {
        status:
          'PARTIAL',
        deferred: 1,
        created: 1,
      },
    );
    expect(
      t
        .events()
        .map(
          (
            e,
          ) =>
            e.dedupeHash,
        ),
    ).toEqual(
      [
        hash(
          'c2',
        ),
      ],
    );
    t.live.routes[
      flagKey(
        'u1',
      )
    ] =
      flagBody(
        true,
      );
    const second =
      await t.run();
    expect(
      second,
    ).toMatchObject(
      {
        status:
          'OK',
        created: 1,
        alreadyStored: 1,
        deferred: 0,
      },
    );
    expect(
      t
        .events()
        .find(
          (
            e,
          ) =>
            e.dedupeHash ===
            hash(
              'c1',
            ),
        )!
        .program,
    ).toBe(
      'PHD',
    );
    expect(
      t
        .counts()
        .find(
          (
            c,
          ) =>
            c.program ===
            'PHD',
        )!
        .count,
    ).toBe(
      1,
    );
  });

  it('a roll-up that throws on run 1 is repaired by run 2 from the stored events', async () => {
    const t =
      setup(
        {
          [FEED_KEY]:
            feedBody(
              [
                row(
                  'c1',
                  'u1',
                ),
                row(
                  'c2',
                  'u2',
                ),
              ],
            ),
          [flagKey(
            'u1',
          )]:
            flagBody(
              true,
            ),
          [flagKey(
            'u2',
          )]:
            flagBody(
              true,
            ),
        },
      );
    const real =
      t
        .prisma
        .medCycleCount
        .createMany;
    t.prisma.medCycleCount.createMany =
      async () => {
        throw new Error(
          'db down',
        );
      };
    const first =
      await t.run();
    expect(
      first.status,
    ).toBe(
      'FAILED',
    );
    expect(
      t.events(),
    ).toHaveLength(
      2,
    );
    expect(
      t.counts(),
    ).toHaveLength(
      0,
    );
    t.prisma.medCycleCount.createMany =
      real;
    const second =
      await t.run();
    expect(
      second,
    ).toMatchObject(
      {
        status:
          'OK',
        created: 0,
        alreadyStored: 2,
        lookups: 0,
        rolledUp: 1,
      },
    );
    expect(
      t.counts(),
    ).toHaveLength(
      1,
    );
    expect(
      t.counts()[0],
    ).toMatchObject(
      {
        program:
          'PHD',
        count: 2,
      },
    );
  });

  it('three profile-errors replies do not halt the run (P16)', async () => {
    const users =
      [
        'u1',
        'u2',
        'u3',
        'u4',
      ];
    const routes: Record<
      string,
      | string
      | null
    > =
      {
        [FEED_KEY]:
          feedBody(
            users.map(
              (
                u,
                i,
              ) =>
                row(
                  `c${i}`,
                  u,
                ),
            ),
          ),
      };
    for (const u of users)
      routes[
        flagKey(
          u,
        )
      ] =
        ERRORS;
    routes[
      flagKey(
        'u4',
      )
    ] =
      flagBody(
        true,
      );
    const t =
      setup(
        routes,
      );
    const s =
      await t.run();
    expect(
      s,
    ).toMatchObject(
      {
        status:
          'PARTIAL',
        deferred: 3,
        created: 1,
        lookups: 4,
      },
    );
    expect(
      t
        .events()
        .map(
          (
            e,
          ) =>
            e.program,
        ),
    ).toEqual(
      [
        'PHD',
      ],
    );
  });

  it('lookup cap defers the remainder and the run is PARTIAL', async () => {
    const t =
      setup(
        {
          [FEED_KEY]:
            feedBody(
              [
                row(
                  'c1',
                  'u1',
                ),
                row(
                  'c2',
                  'u2',
                ),
                row(
                  'c3',
                  'u1',
                  {
                    current_status:
                      'INTERVIEW',
                  },
                ),
                row(
                  'c4',
                  'u3',
                ),
              ],
            ),
          [flagKey(
            'u1',
          )]:
            flagBody(
              true,
            ),
          [flagKey(
            'u2',
          )]:
            flagBody(
              false,
            ),
          [flagKey(
            'u3',
          )]:
            flagBody(
              false,
            ),
        },
        {
          maxLookups: 2,
        },
      );
    const s =
      await t.run();
    // u1's second update is cached and still stored; u3 is beyond the cap
    expect(
      s,
    ).toMatchObject(
      {
        status:
          'PARTIAL',
        created: 3,
        deferred: 1,
        lookups: 2,
      },
    );
    expect(
      t
        .events()
        .some(
          (
            e,
          ) =>
            e.dedupeHash ===
            hash(
              'c4',
            ),
        ),
    ).toBe(
      false,
    );
  });

  it('GraphQL errors on the feed fail the run and insert nothing', async () => {
    const t =
      setup(
        {
          [FEED_KEY]:
            ERRORS,
        },
      );
    const s =
      await t.run();
    expect(
      s.status,
    ).toBe(
      'FAILED',
    );
    expect(
      t.events(),
    ).toHaveLength(
      0,
    );
    expect(
      t
        .tables
        .medSourceRun![0],
    ).toMatchObject(
      {
        status:
          'FAILED',
      },
    );
  });

  it('source halted mid-run → PARTIAL, nothing inserted for unlooked rows', async () => {
    const t =
      setup(
        {
          [FEED_KEY]:
            feedBody(
              [
                row(
                  'c1',
                  'u1',
                ),
                row(
                  'c2',
                  'u2',
                ),
                row(
                  'c3',
                  'u3',
                ),
              ],
            ),
          [flagKey(
            'u1',
          )]:
            flagBody(
              true,
            ),
          [flagKey(
            'u2',
          )]:
            null, // plain 404, counted by the client
          [flagKey(
            'u3',
          )]:
            flagBody(
              true,
            ),
        },
        {},
        1,
      );
    const s =
      await t.run();
    expect(
      s,
    ).toMatchObject(
      {
        status:
          'PARTIAL',
        created: 1,
        deferred: 2,
      },
    );
    expect(
      t
        .events()
        .map(
          (
            e,
          ) =>
            e.dedupeHash,
        ),
    ).toEqual(
      [
        hash(
          'c1',
        ),
      ],
    );
    expect(
      t.requestedPosts.some(
        (
          p,
        ) =>
          JSON.stringify(
            p.variables,
          ).includes(
            'u3',
          ),
      ),
    ).toBe(
      false,
    );
  });

  it('unknown status counted, nothing mislabeled', async () => {
    const t =
      setup(
        {
          [FEED_KEY]:
            feedBody(
              [
                row(
                  'c1',
                  'u1',
                  {
                    current_status:
                      'SOMETHING_NEW',
                  },
                ),
                row(
                  'c2',
                  'u1',
                ),
              ],
            ),
          [flagKey(
            'u1',
          )]:
            flagBody(
              false,
            ),
        },
      );
    const s =
      await t.run();
    expect(
      s,
    ).toMatchObject(
      {
        unknownStatus: 1,
        created: 1,
        fetched: 1,
      },
    );
    expect(
      t.events(),
    ).toHaveLength(
      1,
    );
  });

  it('future-dated row skipped, back-dated row kept on its own UTC day', async () => {
    const t =
      setup(
        {
          [FEED_KEY]:
            feedBody(
              [
                row(
                  'c1',
                  'u1',
                  {
                    current_status_date:
                      '2026-12-25T00:00:00.000Z',
                  },
                ),
                row(
                  'c2',
                  'u1',
                  {
                    current_status_date:
                      '2026-11-18T23:59:00.000Z',
                  },
                ),
              ],
            ),
          [flagKey(
            'u1',
          )]:
            flagBody(
              false,
            ),
        },
      );
    const s =
      await t.run();
    expect(
      s,
    ).toMatchObject(
      {
        badDate: 1,
        created: 1,
      },
    );
    expect(
      (
        t.counts()[0]!
          .date as Date
      ).toISOString(),
    ).toBe(
      '2026-11-18T00:00:00.000Z',
    );
  });

  it('unknown slug records one miss per slug per run; an ignored miss is not recorded', async () => {
    const t =
      setup(
        {
          [FEED_KEY]:
            feedBody(
              [
                row(
                  'c1',
                  'u1',
                  {
                    school:
                      {
                        slug: 'mystery-school',
                      },
                  },
                ),
                row(
                  'c2',
                  'u1',
                  {
                    school:
                      {
                        slug: 'mystery-school',
                      },
                  },
                ),
                row(
                  'c3',
                  'u1',
                  {
                    school:
                      {
                        slug: 'quiet-school',
                      },
                  },
                ),
              ],
            ),
        },
      );
    t.tables.medSchoolAliasMiss!.push(
      {
        id: 'm1',
        source:
          'ADMIT',
        sourceKey:
          'quiet-school',
        ignored: true,
        seenCount: 4,
      },
    );
    const s =
      await t.run();
    expect(
      s,
    ).toMatchObject(
      {
        misses: 1,
        created: 0,
        lookups: 0,
      },
    );
    const misses =
      t
        .tables
        .medSchoolAliasMiss! as Array<
        Record<
          string,
          unknown
        >
      >;
    expect(
      misses.find(
        (
          m,
        ) =>
          m.sourceKey ===
          'mystery-school',
      ),
    ).toMatchObject(
      {
        seenCount: 1,
      },
    );
    expect(
      misses.find(
        (
          m,
        ) =>
          m.sourceKey ===
          'quiet-school',
      )!
        .seenCount,
    ).toBe(
      4,
    );
    await t.run();
    expect(
      misses.find(
        (
          m,
        ) =>
          m.sourceKey ===
          'mystery-school',
      )!
        .seenCount,
    ).toBe(
      2,
    );
  });

  it('inactive school skipped', async () => {
    const t =
      setup(
        {
          [FEED_KEY]:
            feedBody(
              [
                row(
                  'c1',
                  'u1',
                  {
                    school:
                      {
                        slug: 'closed-school',
                      },
                  },
                ),
              ],
            ),
          [flagKey(
            'u1',
          )]:
            flagBody(
              true,
            ),
        },
      );
    const s =
      await t.run();
    expect(
      s,
    ).toMatchObject(
      {
        created: 0,
        lookups: 0,
        misses: 0,
      },
    );
  });

  it('withdrawn and hold rows are stored as WITHDRAWN and HOLD', async () => {
    const t =
      setup(
        {
          [FEED_KEY]:
            feedBody(
              [
                row(
                  'c1',
                  'u1',
                  {
                    current_status:
                      'WITHDRAWN',
                  },
                ),
                row(
                  'c2',
                  'u1',
                  {
                    current_status:
                      'HOLD',
                  },
                ),
              ],
            ),
          [flagKey(
            'u1',
          )]:
            flagBody(
              false,
            ),
        },
      );
    await t.run();
    expect(
      t
        .events()
        .map(
          (
            e,
          ) =>
            e.eventType,
        )
        .sort(),
    ).toEqual(
      [
        'HOLD',
        'WITHDRAWN',
      ],
    );
  });

  it('missing or short secret: FAILED, zero requests', async () => {
    const t =
      setup(
        {
          [FEED_KEY]:
            feedBody(
              [
                row(
                  'c1',
                  'u1',
                ),
              ],
            ),
        },
        {
          secret:
            'short',
        },
      );
    const s =
      await t.run();
    expect(
      s,
    ).toMatchObject(
      {
        status:
          'FAILED',
        runId:
          '',
      },
    );
    expect(
      t.requestedPosts,
    ).toHaveLength(
      0,
    );
    expect(
      t.logs.join(
        '\n',
      ),
    ).toMatch(
      /secret/i,
    );
    expect(
      t
        .tables
        .medSourceRun,
    ).toHaveLength(
      0,
    );
  });

  it('stops without lookups when shouldStop is set, deferring the rest', async () => {
    const t =
      setup(
        {
          [FEED_KEY]:
            feedBody(
              [
                row(
                  'c1',
                  'u1',
                ),
              ],
            ),
          [flagKey(
            'u1',
          )]:
            flagBody(
              true,
            ),
        },
        {
          shouldStop:
            () =>
              true,
        },
      );
    const s =
      await t.run();
    expect(
      s,
    ).toMatchObject(
      {
        status:
          'PARTIAL',
        deferred: 1,
        created: 0,
      },
    );
  });

  it('run record is OK with counters only', async () => {
    const t =
      setup(
        {
          [FEED_KEY]:
            feedBody(
              [
                row(
                  'c1',
                  'u1',
                ),
              ],
            ),
          [flagKey(
            'u1',
          )]:
            flagBody(
              true,
            ),
        },
      );
    const s =
      await t.run();
    const rec =
      t
        .tables
        .medSourceRun![0] as {
        status: string;
        stats: Record<
          string,
          unknown
        >;
        source: string;
        job: string;
      };
    expect(
      rec,
    ).toMatchObject(
      {
        status:
          'OK',
        source:
          'ADMIT',
        job: 'admit-live',
      },
    );
    expect(
      Object.keys(
        rec.stats,
      ).sort(),
    ).toEqual(
      [
        'alreadyStored',
        'badDate',
        'created',
        'deferred',
        'durationMs',
        'fetched',
        'lookups',
        'misses',
        'programNull',
        'requests',
        'rolledUp',
        'unknownStatus',
      ].sort(),
    );
    expect(
      Object.values(
        rec.stats,
      ).every(
        (
          v,
        ) =>
          typeof v ===
          'number',
      ),
    ).toBe(
      true,
    );
    expect(
      s.requests,
    ).toBe(
      2,
    );
  });

  it('closes a stale RUNNING row of a killed predecessor', async () => {
    const t =
      setup(
        {
          [FEED_KEY]:
            feedBody(
              [],
            ),
        },
      );
    t.tables.medSourceRun!.push(
      {
        id: 'old',
        source:
          'ADMIT',
        job: 'admit-live',
        status:
          'RUNNING',
      },
    );
    await t.run();
    expect(
      (
        t
          .tables
          .medSourceRun![0] as {
          status: string;
        }
      )
        .status,
    ).toBe(
      'FAILED',
    );
  });
});
