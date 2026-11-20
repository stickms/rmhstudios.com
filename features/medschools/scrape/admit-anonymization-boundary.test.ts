import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';
import { dedupeHash } from '../engine/dedupe';
import {
  PROFILE_FLAG,
  RECENT_UPDATES,
} from './adapters/admit/queries';
import { runAdmitLive } from './run-admit-live';
import { ADMIT_GRAPHQL_PATH } from './sources';
import {
  assertNoLeak,
  createFakeHost,
  createFakePrisma,
  gqlKey,
  NEEDLES,
} from './test-support';

const SECRET =
  'test-secret-0123456789abcdef';
const USER_ID =
  'user-hostile-9931';
const CREATED_KEYS =
  [
    'cycleYear',
    'dedupeHash',
    'eventType',
    'inState',
    'occurredAt',
    'program',
    'schoolId',
    'source',
  ];
const fx =
  (
    n: string,
  ) =>
    readFileSync(
      join(
        __dirname,
        'adapters',
        'admit',
        '__fixtures__',
        `${n}.json`,
      ),
      'utf8',
    );
const ALL_NEEDLES =
  [
    ...NEEDLES,
    '3.987',
    '527',
  ];

async function hostileRun() {
  const fake =
    createFakePrisma();
  fake.tables.medSchool!.push(
    {
      id: 's1',
      active: true,
    },
    {
      id: 's2',
      active: true,
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
  );
  const {
    host,
  } =
    createFakeHost(
      {
        [gqlKey(
          ADMIT_GRAPHQL_PATH,
          RECENT_UPDATES.operationName,
          {
            filterOwnSchools: false,
            slug: 'allSchools',
          },
        )]:
          fx(
            'recent-updates-hostile',
          ),
        [gqlKey(
          ADMIT_GRAPHQL_PATH,
          PROFILE_FLAG.operationName,
          {
            userId:
              USER_ID,
          },
        )]:
          fx(
            'profile-flag-hostile',
          ),
      },
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
  const summary =
    await runAdmitLive(
      {
        prisma:
          fake.prisma,
        host,
        secret:
          SECRET,
        shouldStop:
          () =>
            false,
        log,
        now: () =>
          new Date(
            '2026-11-20T18:00:00.000Z',
          ),
      },
      {
        trigger:
          'MANUAL',
      },
    );
  return {
    fake,
    logs,
    summary,
  };
}

describe('Admit live run anonymization boundary', () => {
  it('no person field reaches any write', async () => {
    const {
      fake,
      summary,
    } =
      await hostileRun();
    expect(
      summary,
    ).toMatchObject(
      {
        status:
          'OK',
        created: 2,
        lookups: 1,
      },
    );
    assertNoLeak(
      fake.writes,
      ALL_NEEDLES,
    );
    assertNoLeak(
      [
        fake.tables,
      ],
      ALL_NEEDLES,
    );
  });

  it('no write contains the keyed hash of the user id or the user id itself', async () => {
    const {
      fake,
    } =
      await hostileRun();
    const dump =
      JSON.stringify(
        [
          fake.writes,
          fake.tables,
        ],
      );
    expect(
      dump,
    ).not.toContain(
      dedupeHash(
        SECRET,
        'ADMIT',
        USER_ID,
      ),
    );
    expect(
      dump,
    ).not.toContain(
      USER_ID,
    );
    expect(
      dump,
    ).not.toContain(
      'user_id',
    );
  });

  it('created event rows have exactly the anonymous keys', async () => {
    const {
      fake,
    } =
      await hostileRun();
    const events =
      fake
        .tables
        .medCycleEvent! as Array<
        Record<
          string,
          unknown
        >
      >;
    expect(
      events,
    ).toHaveLength(
      2,
    );
    for (const e of events)
      expect(
        Object.keys(
          e,
        )
          .filter(
            (
              k,
            ) =>
              k !==
              'id',
          )
          .sort(),
      ).toEqual(
        CREATED_KEYS,
      );
    for (const w of fake.writes as Array<{
      data?: unknown;
    }>) {
      if (
        !Array.isArray(
          w.data,
        )
      )
        continue;
      for (const d of w.data as Array<
        Record<
          string,
          unknown
        >
      >) {
        if (
          'dedupeHash' in
          d
        )
          expect(
            Object.keys(
              d,
            ).sort(),
          ).toEqual(
            CREATED_KEYS,
          );
      }
    }
    expect(
      events.every(
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

  it('log lines and run stats contain no needle', async () => {
    const {
      fake,
      logs,
    } =
      await hostileRun();
    assertNoLeak(
      logs,
      ALL_NEEDLES,
    );
    assertNoLeak(
      fake
        .tables
        .medSourceRun!,
      ALL_NEEDLES,
    );
    expect(
      logs.join(
        '\n',
      ),
    ).not.toContain(
      USER_ID,
    );
  });

  it('negative control: a planted needle is caught', async () => {
    const {
      fake,
    } =
      await hostileRun();
    expect(
      () =>
        assertNoLeak(
          [
            ...fake.writes,
            {
              data: {
                note: 'drsmith42',
              },
            },
          ],
          ALL_NEEDLES,
        ),
    ).toThrow(
      /Leak/,
    );
    expect(
      () =>
        assertNoLeak(
          [
            {
              gpa: 3.987,
            },
          ],
          ALL_NEEDLES,
        ),
    ).toThrow(
      /Leak/,
    );
  });
});
