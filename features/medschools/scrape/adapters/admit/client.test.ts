import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';
import { cycleYearOf } from '../../../engine/cycle';
import { dedupeHash } from '../../../engine/dedupe';
import { SourceHaltedError } from '../../http';
import { ADMIT_GRAPHQL_PATH } from '../../sources';
import {
  createFakeHost,
  gqlKey,
  NEEDLES,
} from '../../test-support';
import {
  AdmitResponseError,
  createAdmitClient,
} from './client';
import {
  INTERVIEW_FEEDBACK,
  INTERVIEW_OVERVIEW,
  INTERVIEW_QUESTIONS,
  INTERVIEW_SCHOOLS,
  PROFILE_FLAG,
  RECENT_UPDATES,
  SCHOOL_STATS,
  type AdmitOperation,
} from './queries';

const SECRET =
  'test-secret-0123456789abcdef';
const NOW =
  new Date(
    '2026-11-20T18:00:00.000Z',
  );
const fx =
  (
    name: string,
  ) =>
    readFileSync(
      join(
        __dirname,
        '__fixtures__',
        `${name}.json`,
      ),
      'utf8',
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
const feedVars =
  (
    slug: string,
  ) => ({
    filterOwnSchools: false,
    slug,
  });
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

function setup(
  routes: Record<
    string,
    | string
    | null
  >,
) {
  const fake =
    createFakeHost(
      routes,
    );
  const session =
    fake.host.session();
  const client =
    createAdmitClient(
      session,
      {
        secret:
          SECRET,
        now: () =>
          NOW,
      },
    );
  return {
    ...fake,
    session,
    client,
  };
}

const feedBody =
  (
    rows: unknown[],
  ) =>
    JSON.stringify(
      {
        data: {
          getRecentSchoolCycleUpdates:
            rows,
        },
      },
    );
const row =
  (
    over: Record<
      string,
      unknown
    > = {},
  ) => ({
    cycle_update_id:
      'upd-1',
    school:
      {
        slug: 'harvard-medical-school',
      },
    user_id:
      'u-1',
    current_status:
      'ACCEPTED',
    current_status_date:
      '2026-11-19T12:00:00.000Z',
    ...over,
  });
const feedRoute =
  (
    rows: unknown[],
  ) => ({
    [key(
      RECENT_UPDATES,
      feedVars(
        'allSchools',
      ),
    )]:
      feedBody(
        rows,
      ),
  });

describe('fetchFeed', () => {
  it('feed rows become NormalizedEvents with program null and a keyed hash', async () => {
    const {
      client,
      requestedPosts,
    } =
      setup(
        {
          [key(
            RECENT_UPDATES,
            feedVars(
              'allSchools',
            ),
          )]:
            fx(
              'recent-updates-all',
            ),
        },
      );
    const {
      items,
      skipped,
    } =
      await client.fetchFeed();
    const raw =
      JSON.parse(
        fx(
          'recent-updates-all',
        ),
      )
        .data
        .getRecentSchoolCycleUpdates as Array<
        Record<
          string,
          string
        >
      >;
    expect(
      requestedPosts,
    ).toEqual(
      [
        {
          op: 'getRecentSchoolCycleUpdates',
          variables:
            feedVars(
              'allSchools',
            ),
        },
      ],
    );
    expect(
      items.length +
        skipped.unknownStatus +
        skipped.badDate,
    ).toBe(
      raw.length,
    );
    expect(
      items.length,
    ).toBeGreaterThan(
      0,
    );
    const first =
      items[0]!
        .event;
    const src =
      raw[0]!;
    expect(
      first,
    ).toMatchObject(
      {
        source:
          'ADMIT',
        schoolKey:
          src.school
            ? (
                src.school as unknown as {
                  slug: string;
                }
              )
                .slug
            : '',
        program:
          null,
        inState:
          null,
      },
    );
    expect(
      first.dedupeHash,
    ).toBe(
      dedupeHash(
        SECRET,
        'ADMIT',
        src.cycle_update_id!,
      ),
    );
    for (const it of items) {
      expect(
        it
          .event
          .cycleYear,
      ).toBe(
        cycleYearOf(
          it
            .event
            .occurredAt,
          it
            .event
            .eventType,
        ),
      );
    }
  });

  it('a per-school slug is passed through', async () => {
    const {
      client,
    } =
      setup(
        {
          [key(
            RECENT_UPDATES,
            feedVars(
              'harvard-medical-school',
            ),
          )]:
            fx(
              'recent-updates-harvard',
            ),
        },
      );
    const {
      items,
    } =
      await client.fetchFeed(
        'harvard-medical-school',
      );
    expect(
      items.length,
    ).toBeGreaterThan(
      0,
    );
  });

  it('a feed item exposes only event and lookup', async () => {
    const {
      client,
    } =
      setup(
        {
          [key(
            RECENT_UPDATES,
            feedVars(
              'allSchools',
            ),
          )]:
            fx(
              'recent-updates-hostile',
            ),
        },
      );
    const {
      items,
    } =
      await client.fetchFeed();
    expect(
      items.length,
    ).toBe(
      2,
    );
    for (const item of items) {
      expect(
        Object.keys(
          item,
        ),
      ).toEqual(
        [
          'event',
          'lookup',
        ],
      );
      const dump =
        JSON.stringify(
          item,
        );
      for (const n of NEEDLES)
        expect(
          dump,
        ).not.toContain(
          n,
        );
      expect(
        dump,
      ).not.toContain(
        'user-hostile',
      );
      expect(
        JSON.stringify(
          item.lookup,
        ),
      ).toBe(
        '{}',
      );
      expect(
        Object.isFrozen(
          item.lookup,
        ),
      ).toBe(
        true,
      );
    }
  });

  it('hostile feed fixture: extra person fields never surface anywhere in the returned values', async () => {
    const {
      client,
    } =
      setup(
        {
          [key(
            RECENT_UPDATES,
            feedVars(
              'allSchools',
            ),
          )]:
            fx(
              'recent-updates-hostile',
            ),
        },
      );
    const out =
      await client.fetchFeed();
    const dump =
      JSON.stringify(
        out,
      );
    for (const n of NEEDLES)
      expect(
        dump,
      ).not.toContain(
        n,
      );
    expect(
      dump,
    ).not.toMatch(
      /display_name|profile_image|avatar|user_id/,
    );
  });

  it('unknown status is skipped and counted', async () => {
    const {
      client,
    } =
      setup(
        feedRoute(
          [
            row(),
            row(
              {
                cycle_update_id:
                  'upd-2',
                current_status:
                  'SECONDARY',
              },
            ),
            row(
              {
                cycle_update_id:
                  'upd-3',
                current_status:
                  'WEIRD',
              },
            ),
          ],
        ),
      );
    const {
      items,
      skipped,
    } =
      await client.fetchFeed();
    expect(
      items.length,
    ).toBe(
      1,
    );
    expect(
      skipped,
    ).toEqual(
      {
        unknownStatus: 2,
        badDate: 0,
      },
    );
  });

  it('unparseable and future (> now+1 day) dates are skipped and counted as badDate; a back-dated row is kept', async () => {
    const {
      client,
    } =
      setup(
        feedRoute(
          [
            row(
              {
                cycle_update_id:
                  'a',
                current_status_date:
                  'not a date',
              },
            ),
            row(
              {
                cycle_update_id:
                  'b',
                current_status_date:
                  '2026-11-22T00:00:00.000Z',
              },
            ),
            row(
              {
                cycle_update_id:
                  'c',
                current_status_date:
                  '2026-11-21T00:00:00.000Z',
              },
            ),
            row(
              {
                cycle_update_id:
                  'd',
                current_status_date:
                  '2025-01-05T00:00:00.000Z',
              },
            ),
          ],
        ),
      );
    const {
      items,
      skipped,
    } =
      await client.fetchFeed();
    expect(
      skipped,
    ).toEqual(
      {
        unknownStatus: 0,
        badDate: 2,
      },
    );
    expect(
      items.map(
        (
          i,
        ) =>
          i
            .event
            .dedupeHash,
      ),
    ).toEqual(
      [
        dedupeHash(
          SECRET,
          'ADMIT',
          'c',
        ),
        dedupeHash(
          SECRET,
          'ADMIT',
          'd',
        ),
      ],
    );
  });

  it('cycle year follows the event type (a summer acceptance belongs to that August class)', async () => {
    const {
      client,
    } =
      setup(
        feedRoute(
          [
            row(
              {
                current_status_date:
                  '2026-07-15T00:00:00.000Z',
              },
            ),
          ],
        ),
      );
    const {
      items,
    } =
      await client.fetchFeed();
    expect(
      items[0]!
        .event
        .eventType,
    ).toBe(
      'ACCEPTANCE',
    );
    expect(
      items[0]!
        .event
        .cycleYear,
    ).toBe(
      2026,
    );
  });
});

describe('programOf', () => {
  const twoUsers =
    (
      a: unknown,
      b: unknown,
    ) => ({
      ...feedRoute(
        [
          row(
            {
              cycle_update_id:
                'u1',
              user_id:
                'user-a',
            },
          ),
          row(
            {
              cycle_update_id:
                'u2',
              user_id:
                'user-b',
            },
          ),
        ],
      ),
      [flagKey(
        'user-a',
      )]:
        JSON.stringify(
          {
            data: {
              getCycleTrackProfileByUserId:
                a,
            },
          },
        ),
      [flagKey(
        'user-b',
      )]:
        JSON.stringify(
          {
            data: {
              getCycleTrackProfileByUserId:
                b,
            },
          },
        ),
    });

  it('true → PHD, null → REG, false → REG, profile null → UNREADABLE', async () => {
    const cases: Array<
      [
        unknown,
        unknown,
        string,
        string,
      ]
    > =
      [
        [
          {
            md_phd: true,
          },
          {
            md_phd:
              null,
          },
          'PHD',
          'REG',
        ],
        [
          {
            md_phd: false,
          },
          null,
          'REG',
          'UNREADABLE',
        ],
      ];
    for (const [
      a,
      b,
      ea,
      eb,
    ] of cases) {
      const {
        client,
      } =
        setup(
          twoUsers(
            a,
            b,
          ),
        );
      const {
        items,
      } =
        await client.fetchFeed();
      expect(
        await client.programOf(
          items[0]!
            .lookup,
        ),
      ).toBe(
        ea,
      );
      expect(
        await client.programOf(
          items[1]!
            .lookup,
        ),
      ).toBe(
        eb,
      );
    }
  });

  it('a GraphQL errors reply is FAILED without counting toward the halt; an HTTP failure is FAILED and counts (P16)', async () => {
    const {
      client,
      session,
    } =
      setup(
        {
          ...feedRoute(
            [
              row(
                {
                  cycle_update_id:
                    'u1',
                  user_id:
                    'user-a',
                },
              ),
              row(
                {
                  cycle_update_id:
                    'u2',
                  user_id:
                    'user-b',
                },
              ),
            ],
          ),
          [flagKey(
            'user-a',
          )]:
            JSON.stringify(
              {
                errors:
                  [
                    {
                      message:
                        'boom',
                    },
                  ],
                data: null,
              },
            ),
          [flagKey(
            'user-b',
          )]:
            null,
        },
      );
    const {
      items,
    } =
      await client.fetchFeed();
    expect(
      await client.programOf(
        items[0]!
          .lookup,
      ),
    ).toBe(
      'FAILED',
    );
    expect(
      session.lastFailure,
    ).toBeNull();
    expect(
      await client.programOf(
        items[1]!
          .lookup,
      ),
    ).toBe(
      'FAILED',
    );
    expect(
      session.lastFailure,
    ).not.toBeNull();
    // fetchFeed succeeded (reset), then one counted failure (the 404): two more halt the session
    session.noteFailure(
      'x',
    );
    expect(
      session.halted,
    ).toBe(
      false,
    );
    session.noteFailure(
      'y',
    );
    expect(
      session.halted,
    ).toBe(
      true,
    );
  });

  it('asks once per distinct user (lookups === 1 for two tokens of one user)', async () => {
    const {
      client,
      requestedPosts,
    } =
      setup(
        {
          ...feedRoute(
            [
              row(
                {
                  cycle_update_id:
                    'u1',
                },
              ),
              row(
                {
                  cycle_update_id:
                    'u2',
                },
              ),
            ],
          ),
          [flagKey(
            'u-1',
          )]:
            JSON.stringify(
              {
                data: {
                  getCycleTrackProfileByUserId:
                    {
                      md_phd: true,
                    },
                },
              },
            ),
        },
      );
    const {
      items,
    } =
      await client.fetchFeed();
    expect(
      items[0]!
        .lookup,
    ).not.toBe(
      items[1]!
        .lookup,
    );
    expect(
      await client.programOf(
        items[0]!
          .lookup,
      ),
    ).toBe(
      'PHD',
    );
    expect(
      await client.programOf(
        items[1]!
          .lookup,
      ),
    ).toBe(
      'PHD',
    );
    expect(
      client.lookups,
    ).toBe(
      1,
    );
    expect(
      requestedPosts.filter(
        (
          p,
        ) =>
          p.op ===
          PROFILE_FLAG.operationName,
      ),
    ).toHaveLength(
      1,
    );
  });

  it('hostile profile fixture: gpa/mcat/display_name are never read (the request document selects only md_phd)', async () => {
    const {
      client,
      requestedPosts,
    } =
      setup(
        {
          ...feedRoute(
            [
              row(
                {
                  user_id:
                    'user-a',
                },
              ),
            ],
          ),
          [flagKey(
            'user-a',
          )]:
            fx(
              'profile-flag-hostile',
            ),
        },
      );
    const {
      items,
    } =
      await client.fetchFeed();
    expect(
      await client.programOf(
        items[0]!
          .lookup,
      ),
    ).toBe(
      'PHD',
    );
    expect(
      requestedPosts.at(
        -1,
      )!
        .variables,
    ).toEqual(
      {
        userId:
          'user-a',
      },
    );
    expect(
      PROFILE_FLAG.query,
    ).toContain(
      'md_phd',
    );
    for (const f of [
      'gpa',
      'mcat',
      'display_name',
      'username',
    ])
      expect(
        PROFILE_FLAG.query,
      ).not.toContain(
        f,
      );
  });

  it('a token is not the user id: the id appears in no returned value', async () => {
    const {
      client,
    } =
      setup(
        {
          ...feedRoute(
            [
              row(
                {
                  user_id:
                    'secret-user-id',
                },
              ),
            ],
          ),
          [flagKey(
            'secret-user-id',
          )]:
            fx(
              'profile-flag-true',
            ),
        },
      );
    const {
      items,
    } =
      await client.fetchFeed();
    const flag =
      await client.programOf(
        items[0]!
          .lookup,
      );
    expect(
      JSON.stringify(
        [
          items,
          flag,
        ],
      ),
    ).not.toContain(
      'secret-user-id',
    );
  });
});

describe('failure handling', () => {
  const feedKey =
    key(
      RECENT_UPDATES,
      feedVars(
        'allSchools',
      ),
    );

  it('200 with errors array throws AdmitResponseError and notes a failure', async () => {
    const {
      client,
      session,
    } =
      setup(
        {
          [feedKey]:
            JSON.stringify(
              {
                errors:
                  [
                    {
                      message:
                        'nope',
                    },
                  ],
                data: null,
              },
            ),
        },
      );
    await expect(
      client.fetchFeed(),
    ).rejects.toBeInstanceOf(
      AdmitResponseError,
    );
    expect(
      session.lastFailure,
    ).toMatch(
      /GraphQL errors/,
    );
  });

  it('three such responses halt (SourceHaltedError on the fourth call)', async () => {
    const {
      client,
      session,
    } =
      setup(
        {
          [feedKey]:
            JSON.stringify(
              {
                errors:
                  [
                    {
                      message:
                        'nope',
                    },
                  ],
              },
            ),
        },
      );
    for (
      let i = 0;
      i <
      3;
      i++
    )
      await expect(
        client.fetchFeed(),
      ).rejects.toBeInstanceOf(
        AdmitResponseError,
      );
    expect(
      session.halted,
    ).toBe(
      true,
    );
    await expect(
      client.fetchFeed(),
    ).rejects.toBeInstanceOf(
      SourceHaltedError,
    );
  });

  it('invalid JSON is a failure', async () => {
    const {
      client,
      session,
    } =
      setup(
        {
          [feedKey]:
            '<html>',
        },
      );
    await expect(
      client.fetchFeed(),
    ).rejects.toBeInstanceOf(
      AdmitResponseError,
    );
    expect(
      session.lastFailure,
    ).toMatch(
      /not JSON/,
    );
  });

  it('reshaped payload (data null) is a failure, not an empty list', async () => {
    const {
      client,
      session,
    } =
      setup(
        {
          [feedKey]:
            JSON.stringify(
              {
                data: null,
              },
            ),
        },
      );
    await expect(
      client.fetchFeed(),
    ).rejects.toBeInstanceOf(
      AdmitResponseError,
    );
    expect(
      session.lastFailure,
    ).toMatch(
      /shape/,
    );
    const second =
      setup(
        {
          [feedKey]:
            JSON.stringify(
              {
                data: {
                  getRecentSchoolCycleUpdates:
                    null,
                },
              },
            ),
        },
      );
    await expect(
      second.client.fetchFeed(),
    ).rejects.toBeInstanceOf(
      AdmitResponseError,
    );
  });

  it('a 404 from the host throws AdmitResponseError and is counted', async () => {
    const {
      client,
      session,
    } =
      setup(
        {},
      );
    await expect(
      client.fetchFeed(),
    ).rejects.toBeInstanceOf(
      AdmitResponseError,
    );
    expect(
      session.lastFailure,
    ).toMatch(
      /HTTP 404/,
    );
  });

  it('a parsed response resets the failure counter', async () => {
    const {
      client,
      session,
    } =
      setup(
        {
          [feedKey]:
            feedBody(
              [],
            ),
        },
      );
    session.noteFailure(
      'a',
    );
    session.noteFailure(
      'b',
    );
    await client.fetchFeed();
    session.noteFailure(
      'c',
    );
    expect(
      session.halted,
    ).toBe(
      false,
    );
  });
});

describe('stats', () => {
  const statsKey =
    (
      filter: string,
      page: number,
    ) =>
      key(
        SCHOOL_STATS,
        {
          ...SCHOOL_STATS.variables,
          filterBy:
            filter,
          page,
          pageSize: 999,
        },
      );
  const statsRow =
    (
      i: number,
      over: Record<
        string,
        unknown
      > = {},
    ) => ({
      id: i,
      school:
        {
          slug: `school-${i}`,
        },
      application_number:
        100 +
        i,
      application_to_interview_pct: 0.2,
      interview_number: 20,
      interview_to_admitted_pct: 0.5,
      admitted_number: 10,
      mcat: 515,
      gpa: 3.8,
      residence_type:
        'global',
      research_hours:
        null,
      clinical_hours: 712.5,
      non_clinical_hours:
        null,
      ...over,
    });
  const statsBody =
    (
      rows: unknown[],
    ) =>
      JSON.stringify(
        {
          data: {
            getSchoolStats:
              rows,
          },
        },
      );

  it('pageSize 999, loops until a short page, skips rows with a null slug, keeps in-state/out-of-state counts as published', async () => {
    const full =
      Array.from(
        {
          length: 999,
        },
        (
          _,
          i,
        ) =>
          statsRow(
            i +
              1,
            i ===
              0
              ? {
                  school:
                    {
                      slug: null,
                    },
                }
              : {},
          ),
      );
    const {
      client,
      requestedPosts,
    } =
      setup(
        {
          [statsKey(
            'GLOBAL',
            1,
          )]:
            statsBody(
              full,
            ),
          [statsKey(
            'GLOBAL',
            2,
          )]:
            statsBody(
              [
                statsRow(
                  5000,
                ),
              ],
            ),
        },
      );
    const out =
      await client.fetchSchoolStats(
        'GLOBAL',
      );
    expect(
      out,
    ).toHaveLength(
      999 -
        1 +
        1,
    );
    expect(
      requestedPosts.map(
        (
          p,
        ) =>
          (
            p.variables as {
              page: number;
            }
          )
            .page,
      ),
    ).toEqual(
      [
        1,
        2,
      ],
    );
    expect(
      requestedPosts.every(
        (
          p,
        ) =>
          (
            p.variables as {
              pageSize: number;
            }
          )
            .pageSize ===
          999,
      ),
    ).toBe(
      true,
    );
    expect(
      out.at(
        -1,
      ),
    ).toMatchObject(
      {
        schoolKey:
          'school-5000',
        residence:
          'GLOBAL',
        applicationCount: 5100,
        interviewCount: 20,
        admittedCount: 10,
        applicationToInterviewPct: 0.2,
        gpaMedian: 3.8,
        mcatMedian: 515,
        clinicalHours: 712.5,
        researchHours:
          null,
      },
    );
  });

  it('in-state and out-of-state fixtures are stored with their requested residence and published counts', async () => {
    const {
      client,
    } =
      setup(
        {
          [statsKey(
            'IN_STATE',
            1,
          )]:
            fx(
              'school-stats-in-state',
            ),
          [statsKey(
            'OUT_OF_STATE',
            1,
          )]:
            fx(
              'school-stats-out-of-state',
            ),
        },
      );
    const inState =
      await client.fetchSchoolStats(
        'IN_STATE',
      );
    const out =
      await client.fetchSchoolStats(
        'OUT_OF_STATE',
      );
    const raw =
      JSON.parse(
        fx(
          'school-stats-in-state',
        ),
      )
        .data
        .getSchoolStats as Array<{
        application_number: number;
      }>;
    expect(
      inState.map(
        (
          r,
        ) =>
          r.applicationCount,
      ),
    ).toEqual(
      raw.map(
        (
          r,
        ) =>
          r.application_number,
      ),
    );
    expect(
      inState.every(
        (
          r,
        ) =>
          r.residence ===
          'IN_STATE',
      ),
    ).toBe(
      true,
    );
    expect(
      out.every(
        (
          r,
        ) =>
          r.residence ===
          'OUT_OF_STATE',
      ),
    ).toBe(
      true,
    );
  });

  it('global fixture normalizes', async () => {
    const {
      client,
    } =
      setup(
        {
          [statsKey(
            'GLOBAL',
            1,
          )]:
            fx(
              'school-stats-global',
            ),
        },
      );
    const rows =
      await client.fetchSchoolStats(
        'GLOBAL',
      );
    expect(
      rows,
    ).toHaveLength(
      5,
    );
    expect(
      rows[0]!
        .schoolKey,
    ).toMatch(
      /medical|medicine/,
    );
  });
});

describe('interviews', () => {
  const schoolsKey =
    (
      offset: number,
    ) =>
      key(
        INTERVIEW_SCHOOLS,
        {
          ...INTERVIEW_SCHOOLS.variables,
          limit: 100,
          offset,
        },
      );
  const slug =
    'harvard-medical-school';

  it('listInterviewSchools pages 100 until totalCount', async () => {
    const {
      client,
      requestedPosts,
    } =
      setup(
        {
          [schoolsKey(
            0,
          )]:
            fx(
              'interview-schools-0',
            ),
          [schoolsKey(
            100,
          )]:
            fx(
              'interview-schools-0',
            ),
          [schoolsKey(
            200,
          )]:
            fx(
              'interview-schools-200',
            ),
        },
      );
    const schools =
      await client.listInterviewSchools();
    expect(
      schools,
    ).toHaveLength(
      239,
    );
    expect(
      requestedPosts.map(
        (
          p,
        ) =>
          (
            p.variables as {
              offset: number;
            }
          )
            .offset,
      ),
    ).toEqual(
      [
        0,
        100,
        200,
      ],
    );
    expect(
      schools[0],
    ).toEqual(
      {
        slug: 'harvard-medical-school',
        name: 'Harvard Medical School',
        shortName:
          'Harvard Medical School',
        city: 'Boston',
        state:
          'MA',
        avgDifficulty: 4.565217391304348,
        interviewCount: 467,
        totalInterviewCount: 757,
      },
    );
  });

  it('listInterviewSchools stops on an empty page instead of looping', async () => {
    const empty =
      JSON.stringify(
        {
          data: {
            getMedicalInterviewSchoolsOverview:
              {
                totalCount: 500,
                schools:
                  [],
              },
          },
        },
      );
    const {
      client,
      requestedPosts,
    } =
      setup(
        {
          [schoolsKey(
            0,
          )]:
            empty,
        },
      );
    expect(
      await client.listInterviewSchools(),
    ).toEqual(
      [],
    );
    expect(
      requestedPosts,
    ).toHaveLength(
      1,
    );
  });

  it('fetchInterviewProfile merges overview and feedback in two requests', async () => {
    const {
      client,
      requestedPosts,
    } =
      setup(
        {
          [key(
            INTERVIEW_OVERVIEW,
            {
              schoolSlug:
                slug,
            },
          )]:
            fx(
              'interview-overview-harvard',
            ),
          [key(
            INTERVIEW_FEEDBACK,
            {
              schoolSlug:
                slug,
            },
          )]:
            fx(
              'interview-feedback-harvard',
            ),
        },
      );
    const p =
      await client.fetchInterviewProfile(
        slug,
      );
    expect(
      requestedPosts,
    ).toHaveLength(
      2,
    );
    expect(
      p,
    ).toMatchObject(
      {
        schoolKey:
          slug,
        format:
          'STANDARD',
        fileType:
          'OPEN_FILE',
        avgDifficulty: 4.565217391304348,
        interviewCount: 467,
      },
    );
    expect(
      p
        .positive
        .length,
    ).toBeGreaterThan(
      0,
    );
    expect(
      p
        .negative
        .length,
    ).toBeGreaterThan(
      0,
    );
    expect(
      p
        .before
        .length,
    ).toBeGreaterThan(
      0,
    );
  });

  it('questions: trims, collapses whitespace, drops empty bodies, hash is dedupeHash(secret,ADMIT,question:+id)', async () => {
    const body =
      JSON.stringify(
        {
          data: {
            getInterviewsForSchool:
              {
                questions:
                  [
                    {
                      id: 1,
                      body: '  Why   medicine?\n ',
                      votes: 3,
                    },
                    {
                      id: 2,
                      body: '   ',
                      votes: 1,
                    },
                    {
                      id: 3,
                      body: null,
                      votes:
                        null,
                    },
                    {
                      id: 1,
                      body: 'dup',
                      votes: 0,
                    },
                    {
                      id: 4,
                      body: 'Tell me about yourself.',
                      votes:
                        null,
                    },
                  ],
              },
          },
        },
      );
    const {
      client,
    } =
      setup(
        {
          [key(
            INTERVIEW_QUESTIONS,
            {
              schoolSlug:
                slug,
            },
          )]:
            body,
        },
      );
    const qs =
      await client.fetchQuestions(
        slug,
      );
    expect(
      qs,
    ).toEqual(
      [
        {
          schoolKey:
            slug,
          text: 'Why medicine?',
          votes: 3,
          dedupeHash:
            dedupeHash(
              SECRET,
              'ADMIT',
              'question:1',
            ),
        },
        {
          schoolKey:
            slug,
          text: 'Tell me about yourself.',
          votes:
            null,
          dedupeHash:
            dedupeHash(
              SECRET,
              'ADMIT',
              'question:4',
            ),
        },
      ],
    );
  });

  it('question fixture never exposes the raw id', async () => {
    const {
      client,
    } =
      setup(
        {
          [key(
            INTERVIEW_QUESTIONS,
            {
              schoolSlug:
                slug,
            },
          )]:
            fx(
              'interview-questions-harvard',
            ),
        },
      );
    const qs =
      await client.fetchQuestions(
        slug,
      );
    expect(
      qs.length,
    ).toBeGreaterThan(
      0,
    );
    expect(
      JSON.stringify(
        qs,
      ),
    ).not.toContain(
      '8368',
    );
  });

  it('isCached is false before a lookup and true after, without a request', async () => {
    const {
      client,
      requestedPosts,
    } =
      setup(
        {
          ...feedRoute(
            [
              row(
                {
                  cycle_update_id:
                    'u1',
                  user_id:
                    'user-a',
                },
              ),
            ],
          ),
          [flagKey(
            'user-a',
          )]:
            fx(
              'profile-flag-true',
            ),
        },
      );
    const {
      items,
    } =
      await client.fetchFeed();
    expect(
      client.isCached(
        items[0]!
          .lookup,
      ),
    ).toBe(
      false,
    );
    await client.programOf(
      items[0]!
        .lookup,
    );
    const posts =
      requestedPosts.length;
    expect(
      client.isCached(
        items[0]!
          .lookup,
      ),
    ).toBe(
      true,
    );
    expect(
      requestedPosts.length,
    ).toBe(
      posts,
    );
  });
});
