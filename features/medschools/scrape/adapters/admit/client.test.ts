import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cycleYearOf } from '../../../engine/cycle';
import { dedupeHash } from '../../../engine/dedupe';
import { SourceHaltedError } from '../../http';
import { ADMIT_GRAPHQL_PATH } from '../../sources';
import { createFakeHost, gqlKey, NEEDLES } from '../../test-support';
import { AdmitResponseError, createAdmitClient } from './client';
import {
  INTERVIEW_FEEDBACK,
  INTERVIEW_OVERVIEW,
  INTERVIEW_QUESTIONS,
  INTERVIEW_SCHOOLS,
  PROFILE_FLAG,
  RECENT_UPDATES,
  RESULT_USERS,
  SCHOOL_CRESTS,
  SCHOOL_STATS,
  type AdmitOperation,
} from './queries';

const SECRET = 'test-secret-0123456789abcdef';
const NOW = new Date('2026-11-20T18:00:00.000Z');
const fx = (name: string) => readFileSync(join(__dirname, '__fixtures__', `${name}.json`), 'utf8');
const key = (op: AdmitOperation, vars: Record<string, unknown>) => gqlKey(ADMIT_GRAPHQL_PATH, op.operationName, vars);
const feedVars = (slug: string) => ({
  filterOwnSchools: false,
  slug,
});
const flagKey = (userId: string) =>
  key(PROFILE_FLAG, {
    userId,
  });

function setup(routes: Record<string, string | null>) {
  const fake = createFakeHost(routes);
  const session = fake.host.session();
  const client = createAdmitClient(session, {
    secret: SECRET,
    now: () => NOW,
  });
  return {
    ...fake,
    session,
    client,
  };
}

const feedBody = (rows: unknown[]) =>
  JSON.stringify({
    data: {
      getRecentSchoolCycleUpdates: rows,
    },
  });
const row = (over: Record<string, unknown> = {}) => ({
  cycle_update_id: 'upd-1',
  school: {
    slug: 'harvard-medical-school',
  },
  user_id: 'u-1',
  current_status: 'ACCEPTED',
  current_status_date: '2026-11-19T12:00:00.000Z',
  ...over,
});
const feedRoute = (rows: unknown[]) => ({
  [key(RECENT_UPDATES, feedVars('allSchools'))]: feedBody(rows),
});

describe('fetchFeed', () => {
  it('feed rows become NormalizedEvents with program null and a keyed hash', async () => {
    const { client, requestedPosts } = setup({
      [key(RECENT_UPDATES, feedVars('allSchools'))]: fx('recent-updates-all'),
    });
    const { items, skipped } = await client.fetchFeed();
    const raw = JSON.parse(fx('recent-updates-all')).data.getRecentSchoolCycleUpdates as Array<Record<string, string>>;
    expect(requestedPosts).toEqual([
      {
        op: 'getRecentSchoolCycleUpdates',
        variables: feedVars('allSchools'),
      },
    ]);
    expect(items.length + skipped.unknownStatus + skipped.badDate).toBe(raw.length);
    expect(items.length).toBeGreaterThan(0);
    const first = items[0]!.event;
    const src = raw[0]!;
    expect(first).toMatchObject({
      source: 'ADMIT',
      schoolKey: src.school
        ? (
            src.school as unknown as {
              slug: string;
            }
          ).slug
        : '',
      program: null,
      inState: null,
    });
    expect(first.dedupeHash).toBe(dedupeHash(SECRET, 'ADMIT', src.cycle_update_id!));
    for (const it of items) {
      expect(it.event.cycleYear).toBe(cycleYearOf(it.event.occurredAt, it.event.eventType));
    }
  });

  it('a per-school slug is passed through', async () => {
    const { client } = setup({
      [key(RECENT_UPDATES, feedVars('harvard-medical-school'))]: fx('recent-updates-harvard'),
    });
    const { items } = await client.fetchFeed('harvard-medical-school');
    expect(items.length).toBeGreaterThan(0);
  });

  it('a feed item exposes only event, lookup and the key closure', async () => {
    const { client } = setup({
      [key(RECENT_UPDATES, feedVars('allSchools'))]: fx('recent-updates-hostile'),
    });
    const { items } = await client.fetchFeed();
    expect(items.length).toBe(2);
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(['event', 'keyFor', 'lookup']);
      expect(typeof item.keyFor).toBe('function');
      const dump = JSON.stringify(item);
      for (const n of NEEDLES) expect(dump).not.toContain(n);
      expect(dump).not.toContain('user-hostile');
      expect(JSON.stringify(item.lookup)).toBe('{}');
      expect(Object.isFrozen(item.lookup)).toBe(true);
    }
  });

  it('hostile feed fixture: extra person fields never surface anywhere in the returned values', async () => {
    const { client } = setup({
      [key(RECENT_UPDATES, feedVars('allSchools'))]: fx('recent-updates-hostile'),
    });
    const out = await client.fetchFeed();
    const dump = JSON.stringify(out);
    for (const n of NEEDLES) expect(dump).not.toContain(n);
    expect(dump).not.toMatch(/display_name|profile_image|avatar|user_id/);
  });

  it('a row with a null slug is dropped and counted without failing the feed; a null user_id has no lookup', async () => {
    const { client } = setup(
      feedRoute([
        row({
          cycle_update_id: 'ok-1',
        }),
        row({
          cycle_update_id: 'bad',
          school: {
            slug: null,
          },
        }),
        row({
          cycle_update_id: 'no-author',
          user_id: null,
        }),
      ]),
    );
    const { items, skipped } = await client.fetchFeed();
    expect(items).toHaveLength(2);
    expect(skipped.malformedRows).toBe(1);
    expect(items[1]!.lookup).toBeNull();
    expect(await client.programOf(items[1]!.lookup)).toBe('UNREADABLE');
    expect(client.lookups).toBe(0);
  });

  it('unknown status is skipped and counted', async () => {
    const { client } = setup(
      feedRoute([
        row(),
        row({
          cycle_update_id: 'upd-2',
          current_status: 'SECONDARY',
        }),
        row({
          cycle_update_id: 'upd-3',
          current_status: 'WEIRD',
        }),
      ]),
    );
    const { items, skipped } = await client.fetchFeed();
    expect(items.length).toBe(1);
    expect(skipped).toEqual({
      unknownStatus: 2,
      badDate: 0,
      malformedRows: 0,
    });
  });

  it('unparseable and future (> now+1 day) dates are skipped and counted as badDate; a back-dated row is kept', async () => {
    const { client } = setup(
      feedRoute([
        row({
          cycle_update_id: 'a',
          current_status_date: 'not a date',
        }),
        row({
          cycle_update_id: 'b',
          current_status_date: '2026-11-22T00:00:00.000Z',
        }),
        row({
          cycle_update_id: 'c',
          current_status_date: '2026-11-21T00:00:00.000Z',
        }),
        row({
          cycle_update_id: 'd',
          current_status_date: '2025-01-05T00:00:00.000Z',
        }),
      ]),
    );
    const { items, skipped } = await client.fetchFeed();
    expect(skipped).toEqual({
      unknownStatus: 0,
      badDate: 2,
      malformedRows: 0,
    });
    expect(items.map((i) => i.event.dedupeHash)).toEqual([
      dedupeHash(SECRET, 'ADMIT', 'c'),
      dedupeHash(SECRET, 'ADMIT', 'd'),
    ]);
  });

  it('cycle year follows the event type (a summer acceptance belongs to that August class)', async () => {
    const { client } = setup(
      feedRoute([
        row({
          current_status_date: '2026-07-15T00:00:00.000Z',
        }),
      ]),
    );
    const { items } = await client.fetchFeed();
    expect(items[0]!.event.eventType).toBe('ACCEPTANCE');
    expect(items[0]!.event.cycleYear).toBe(2026);
  });
});

describe('programOf', () => {
  const twoUsers = (a: unknown, b: unknown) => ({
    ...feedRoute([
      row({
        cycle_update_id: 'u1',
        user_id: 'user-a',
      }),
      row({
        cycle_update_id: 'u2',
        user_id: 'user-b',
      }),
    ]),
    [flagKey('user-a')]: JSON.stringify({
      data: {
        getCycleTrackProfileByUserId: a,
      },
    }),
    [flagKey('user-b')]: JSON.stringify({
      data: {
        getCycleTrackProfileByUserId: b,
      },
    }),
  });

  it('true → PHD, null → REG, false → REG, profile null → UNREADABLE', async () => {
    const cases: Array<[unknown, unknown, string, string]> = [
      [
        {
          md_phd: true,
        },
        {
          md_phd: null,
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
    for (const [a, b, ea, eb] of cases) {
      const { client } = setup(twoUsers(a, b));
      const { items } = await client.fetchFeed();
      expect(await client.programOf(items[0]!.lookup)).toBe(ea);
      expect(await client.programOf(items[1]!.lookup)).toBe(eb);
    }
  });

  it('a GraphQL errors reply is FAILED without counting toward the halt; an HTTP failure is FAILED and counts (P16)', async () => {
    const { client, session } = setup({
      ...feedRoute([
        row({
          cycle_update_id: 'u1',
          user_id: 'user-a',
        }),
        row({
          cycle_update_id: 'u2',
          user_id: 'user-b',
        }),
      ]),
      [flagKey('user-a')]: JSON.stringify({
        errors: [
          {
            message: 'boom',
          },
        ],
        data: null,
      }),
      [flagKey('user-b')]: null,
    });
    const { items } = await client.fetchFeed();
    expect(await client.programOf(items[0]!.lookup)).toBe('FAILED');
    expect(session.lastFailure).toBeNull();
    expect(await client.programOf(items[1]!.lookup)).toBe('FAILED');
    expect(session.lastFailure).not.toBeNull();
    // fetchFeed succeeded (reset), then one counted failure (the 404): two more halt the session
    session.noteFailure('x');
    expect(session.halted).toBe(false);
    session.noteFailure('y');
    expect(session.halted).toBe(true);
  });

  const ERRORS_BODY = JSON.stringify({
    errors: [
      {
        message: 'hidden',
      },
    ],
    data: null,
  });
  const manyUsers = (n: number, bodyOf: (i: number) => string) => ({
    ...feedRoute(
      Array.from(
        {
          length: n,
        },
        (_, i) =>
          row({
            cycle_update_id: `c${i}`,
            user_id: `user-${i}`,
          }),
      ),
    ),
    ...Object.fromEntries(
      Array.from(
        {
          length: n,
        },
        (_, i) => [flagKey(`user-${i}`), bodyOf(i)],
      ),
    ),
  });

  it('ten consecutive errors replies stop lookups, noting one source failure; further users cost no request', async () => {
    const { client, session, requestedPosts } = setup(manyUsers(12, () => ERRORS_BODY));
    const { items } = await client.fetchFeed();
    const flags = [];
    for (const it of items) flags.push(await client.programOf(it.lookup));
    expect(flags.every((f) => f === 'FAILED')).toBe(true);
    expect(client.lookups).toBe(10);
    expect(client.lookupsStopped).toBe(true);
    expect(requestedPosts.filter((p) => p.op === PROFILE_FLAG.operationName)).toHaveLength(10);
    expect(session.lastFailure).not.toBeNull();
    expect(session.halted).toBe(false);
  });

  it('a success between errors resets the streak', async () => {
    const ok = JSON.stringify({
      data: {
        getCycleTrackProfileByUserId: {
          md_phd: false,
        },
      },
    });
    const { client, session } = setup(manyUsers(20, (i) => (i % 10 === 9 ? ok : ERRORS_BODY)));
    const { items } = await client.fetchFeed();
    for (const it of items) await client.programOf(it.lookup);
    expect(client.lookups).toBe(20);
    expect(client.lookupsStopped).toBe(false);
    expect(session.lastFailure).toBeNull();
  });

  it('asks once per distinct user (lookups === 1 for two tokens of one user)', async () => {
    const { client, requestedPosts } = setup({
      ...feedRoute([
        row({
          cycle_update_id: 'u1',
        }),
        row({
          cycle_update_id: 'u2',
        }),
      ]),
      [flagKey('u-1')]: JSON.stringify({
        data: {
          getCycleTrackProfileByUserId: {
            md_phd: true,
          },
        },
      }),
    });
    const { items } = await client.fetchFeed();
    expect(items[0]!.lookup).not.toBe(items[1]!.lookup);
    expect(await client.programOf(items[0]!.lookup)).toBe('PHD');
    expect(await client.programOf(items[1]!.lookup)).toBe('PHD');
    expect(client.lookups).toBe(1);
    expect(requestedPosts.filter((p) => p.op === PROFILE_FLAG.operationName)).toHaveLength(1);
  });

  it('hostile profile fixture: gpa/mcat/display_name are never read (the request document selects only md_phd)', async () => {
    const { client, requestedPosts } = setup({
      ...feedRoute([
        row({
          user_id: 'user-a',
        }),
      ]),
      [flagKey('user-a')]: fx('profile-flag-hostile'),
    });
    const { items } = await client.fetchFeed();
    expect(await client.programOf(items[0]!.lookup)).toBe('PHD');
    expect(requestedPosts.at(-1)!.variables).toEqual({
      userId: 'user-a',
    });
    expect(PROFILE_FLAG.query).toContain('md_phd');
    for (const f of ['gpa', 'mcat', 'display_name', 'username']) expect(PROFILE_FLAG.query).not.toContain(f);
  });

  it('a token is not the user id: the id appears in no returned value', async () => {
    const { client } = setup({
      ...feedRoute([
        row({
          user_id: 'secret-user-id',
        }),
      ]),
      [flagKey('secret-user-id')]: fx('profile-flag-true'),
    });
    const { items } = await client.fetchFeed();
    const flag = await client.programOf(items[0]!.lookup);
    expect(JSON.stringify([items, flag])).not.toContain('secret-user-id');
  });
});

describe('failure handling', () => {
  const feedKey = key(RECENT_UPDATES, feedVars('allSchools'));

  it('200 with errors array throws AdmitResponseError and notes a failure', async () => {
    const { client, session } = setup({
      [feedKey]: JSON.stringify({
        errors: [
          {
            message: 'nope',
          },
        ],
        data: null,
      }),
    });
    await expect(client.fetchFeed()).rejects.toBeInstanceOf(AdmitResponseError);
    expect(session.lastFailure).toMatch(/GraphQL errors/);
  });

  it('three such responses halt (SourceHaltedError on the fourth call)', async () => {
    const { client, session } = setup({
      [feedKey]: JSON.stringify({
        errors: [
          {
            message: 'nope',
          },
        ],
      }),
    });
    for (let i = 0; i < 3; i++) await expect(client.fetchFeed()).rejects.toBeInstanceOf(AdmitResponseError);
    expect(session.halted).toBe(true);
    await expect(client.fetchFeed()).rejects.toBeInstanceOf(SourceHaltedError);
  });

  it('invalid JSON is a failure', async () => {
    const { client, session } = setup({
      [feedKey]: '<html>',
    });
    await expect(client.fetchFeed()).rejects.toBeInstanceOf(AdmitResponseError);
    expect(session.lastFailure).toMatch(/not JSON/);
  });

  it('reshaped payload (data null) is a failure, not an empty list', async () => {
    const { client, session } = setup({
      [feedKey]: JSON.stringify({
        data: null,
      }),
    });
    await expect(client.fetchFeed()).rejects.toBeInstanceOf(AdmitResponseError);
    expect(session.lastFailure).toMatch(/shape/);
    const second = setup({
      [feedKey]: JSON.stringify({
        data: {
          getRecentSchoolCycleUpdates: null,
        },
      }),
    });
    await expect(second.client.fetchFeed()).rejects.toBeInstanceOf(AdmitResponseError);
  });

  it('a 404 from the host throws AdmitResponseError and is counted', async () => {
    const { client, session } = setup({});
    await expect(client.fetchFeed()).rejects.toBeInstanceOf(AdmitResponseError);
    expect(session.lastFailure).toMatch(/HTTP 404/);
  });

  it('a parsed response resets the failure counter', async () => {
    const { client, session } = setup({
      [feedKey]: feedBody([]),
    });
    session.noteFailure('a');
    session.noteFailure('b');
    await client.fetchFeed();
    session.noteFailure('c');
    expect(session.halted).toBe(false);
  });
});

describe('stats', () => {
  const statsKey = (filter: string, page: number) =>
    key(SCHOOL_STATS, {
      ...SCHOOL_STATS.variables,
      filterBy: filter,
      page,
      pageSize: 999,
    });
  const statsRow = (i: number, over: Record<string, unknown> = {}) => ({
    id: i,
    school: {
      slug: `school-${i}`,
    },
    application_number: 100 + i,
    application_to_interview_pct: 0.2,
    interview_number: 20,
    interview_to_admitted_pct: 0.5,
    admitted_number: 10,
    mcat: 515,
    gpa: 3.8,
    residence_type: 'global',
    research_hours: null,
    clinical_hours: 712.5,
    non_clinical_hours: null,
    ...over,
  });
  const statsBody = (rows: unknown[]) =>
    JSON.stringify({
      data: {
        getSchoolStats: rows,
      },
    });

  it('pageSize 999, loops until a short page, skips rows with a null slug, keeps in-state/out-of-state counts as published', async () => {
    const full = Array.from(
      {
        length: 999,
      },
      (_, i) =>
        statsRow(
          i + 1,
          i === 0
            ? {
                school: {
                  slug: null,
                },
              }
            : {},
        ),
    );
    const { client, requestedPosts } = setup({
      [statsKey('GLOBAL', 1)]: statsBody(full),
      [statsKey('GLOBAL', 2)]: statsBody([statsRow(5000)]),
    });
    const out = await client.fetchSchoolStats('GLOBAL');
    expect(out).toHaveLength(999 - 1 + 1);
    expect(
      requestedPosts.map(
        (p) =>
          (
            p.variables as {
              page: number;
            }
          ).page,
      ),
    ).toEqual([1, 2]);
    expect(
      requestedPosts.every(
        (p) =>
          (
            p.variables as {
              pageSize: number;
            }
          ).pageSize === 999,
      ),
    ).toBe(true);
    expect(out.at(-1)).toMatchObject({
      schoolKey: 'school-5000',
      residence: 'GLOBAL',
      applicationCount: 5100,
      interviewCount: 20,
      admittedCount: 10,
      applicationToInterviewPct: 0.2,
      gpaMedian: 3.8,
      mcatMedian: 515,
      clinicalHours: 712.5,
      researchHours: null,
    });
  });

  it('in-state and out-of-state fixtures are stored with their requested residence and published counts', async () => {
    const { client } = setup({
      [statsKey('IN_STATE', 1)]: fx('school-stats-in-state'),
      [statsKey('OUT_OF_STATE', 1)]: fx('school-stats-out-of-state'),
    });
    const inState = await client.fetchSchoolStats('IN_STATE');
    const out = await client.fetchSchoolStats('OUT_OF_STATE');
    const raw = JSON.parse(fx('school-stats-in-state')).data.getSchoolStats as Array<{
      application_number: number;
    }>;
    expect(inState.map((r) => r.applicationCount)).toEqual(raw.map((r) => r.application_number));
    expect(inState.every((r) => r.residence === 'IN_STATE')).toBe(true);
    expect(out.every((r) => r.residence === 'OUT_OF_STATE')).toBe(true);
  });

  it('global fixture normalizes', async () => {
    const { client } = setup({
      [statsKey('GLOBAL', 1)]: fx('school-stats-global'),
    });
    const rows = await client.fetchSchoolStats('GLOBAL');
    expect(rows).toHaveLength(5);
    expect(rows[0]!.schoolKey).toMatch(/medical|medicine/);
  });
});

describe('interviews', () => {
  const schoolsKey = (offset: number) =>
    key(INTERVIEW_SCHOOLS, {
      ...INTERVIEW_SCHOOLS.variables,
      limit: 100,
      offset,
    });
  const slug = 'harvard-medical-school';

  it('listInterviewSchools pages 100 until totalCount', async () => {
    const { client, requestedPosts } = setup({
      [schoolsKey(0)]: fx('interview-schools-0'),
      [schoolsKey(100)]: fx('interview-schools-0'),
      [schoolsKey(200)]: fx('interview-schools-200'),
    });
    const schools = await client.listInterviewSchools();
    expect(schools).toHaveLength(239);
    expect(
      requestedPosts.map(
        (p) =>
          (
            p.variables as {
              offset: number;
            }
          ).offset,
      ),
    ).toEqual([0, 100, 200]);
    expect(schools[0]).toEqual({
      slug: 'harvard-medical-school',
      name: 'Harvard Medical School',
      shortName: 'Harvard Medical School',
      city: 'Boston',
      state: 'MA',
      avgDifficulty: 4.565217391304348,
      interviewCount: 467,
      totalInterviewCount: 757,
    });
  });

  it('listInterviewSchools stops on an empty page instead of looping', async () => {
    const empty = JSON.stringify({
      data: {
        getMedicalInterviewSchoolsOverview: {
          totalCount: 500,
          schools: [],
        },
      },
    });
    const { client, requestedPosts } = setup({
      [schoolsKey(0)]: empty,
    });
    expect(await client.listInterviewSchools()).toEqual([]);
    expect(requestedPosts).toHaveLength(1);
  });

  it('fetchInterviewProfile merges overview and feedback in two requests', async () => {
    const { client, requestedPosts } = setup({
      [key(INTERVIEW_OVERVIEW, {
        schoolSlug: slug,
      })]: fx('interview-overview-harvard'),
      [key(INTERVIEW_FEEDBACK, {
        schoolSlug: slug,
      })]: fx('interview-feedback-harvard'),
    });
    const p = await client.fetchInterviewProfile(slug);
    expect(requestedPosts).toHaveLength(2);
    expect(p).toMatchObject({
      schoolKey: slug,
      format: 'STANDARD',
      fileType: 'OPEN_FILE',
      avgDifficulty: 4.565217391304348,
      interviewCount: 467,
    });
    expect(p!.positive.length).toBeGreaterThan(0);
    expect(p!.negative.length).toBeGreaterThan(0);
    expect(p!.before.length).toBeGreaterThan(0);
  });

  it('questions: trims, collapses whitespace, drops empty bodies, hash is dedupeHash(secret,ADMIT,question:+id)', async () => {
    const body = JSON.stringify({
      data: {
        getInterviewsForSchool: {
          questions: [
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
              votes: null,
            },
            {
              id: 1,
              body: 'dup',
              votes: 0,
            },
            {
              id: 4,
              body: 'Tell me about yourself.',
              votes: null,
            },
          ],
        },
      },
    });
    const { client } = setup({
      [key(INTERVIEW_QUESTIONS, {
        schoolSlug: slug,
      })]: body,
    });
    const qs = await client.fetchQuestions(slug);
    expect(qs).toEqual([
      {
        schoolKey: slug,
        text: 'Why medicine?',
        votes: 3,
        dedupeHash: dedupeHash(SECRET, 'ADMIT', 'question:1'),
      },
      {
        schoolKey: slug,
        text: 'Tell me about yourself.',
        votes: null,
        dedupeHash: dedupeHash(SECRET, 'ADMIT', 'question:4'),
      },
    ]);
  });

  it('a null op or a null question list is unavailable (null), an explicit empty list stays empty', async () => {
    const q = (body: unknown) =>
      setup({
        [key(INTERVIEW_QUESTIONS, {
          schoolSlug: slug,
        })]: JSON.stringify(body),
      }).client.fetchQuestions(slug);
    expect(
      await q({
        data: {
          getInterviewsForSchool: null,
        },
      }),
    ).toBeNull();
    expect(
      await q({
        data: {
          getInterviewsForSchool: {
            questions: null,
          },
        },
      }),
    ).toBeNull();
    expect(
      await q({
        data: {
          getInterviewsForSchool: {
            questions: [],
          },
        },
      }),
    ).toEqual([]);
  });

  it('a null overview or null feedback makes the profile unavailable (null)', async () => {
    const ok = {
      getMedicalInterviewOverview: {
        avg_interview_difficulty: 4,
        interview_count: 3,
        interview_format: 'A',
        interview_type: 'B',
      },
      getInterviewFeedbackForSchool: {
        positive: [],
        negative: [],
        before_interview: [],
      },
    };
    for (const bad of ['getMedicalInterviewOverview', 'getInterviewFeedbackForSchool']) {
      const { client } = setup({
        [key(INTERVIEW_OVERVIEW, {
          schoolSlug: slug,
        })]: JSON.stringify({
          data: {
            ...ok,
            [bad]: null,
          },
        }),
        [key(INTERVIEW_FEEDBACK, {
          schoolSlug: slug,
        })]: JSON.stringify({
          data: {
            ...ok,
            [bad]: null,
          },
        }),
      });
      expect(await client.fetchInterviewProfile(slug)).toBeNull();
    }
  });

  it('question fixture never exposes the raw id', async () => {
    const { client } = setup({
      [key(INTERVIEW_QUESTIONS, {
        schoolSlug: slug,
      })]: fx('interview-questions-harvard'),
    });
    const qs = await client.fetchQuestions(slug);
    expect(qs!.length).toBeGreaterThan(0);
    expect(JSON.stringify(qs)).not.toContain('8368');
  });

  it('isCached is false before a lookup and true after, without a request', async () => {
    const { client, requestedPosts } = setup({
      ...feedRoute([
        row({
          cycle_update_id: 'u1',
          user_id: 'user-a',
        }),
      ]),
      [flagKey('user-a')]: fx('profile-flag-true'),
    });
    const { items } = await client.fetchFeed();
    expect(client.isCached(items[0]!.lookup)).toBe(false);
    await client.programOf(items[0]!.lookup);
    const posts = requestedPosts.length;
    expect(client.isCached(items[0]!.lookup)).toBe(true);
    expect(requestedPosts.length).toBe(posts);
  });
});

describe('listSchoolCrests', () => {
  const crestRow = (slug: string, crest: string | null) => ({
    school: { slug, name: slug, shorthand_name: null, state: 'MA', city: 'Boston', crest_url: crest },
  });
  const page = (offset: number) => key(SCHOOL_CRESTS, { ...SCHOOL_CRESTS.variables, limit: 100, offset });

  it('selects school fields only and pages until a short page', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => crestRow(`s${i}`, `https://x.example/${i}.svg`));
    const { client, requestedPosts } = setup({
      [page(0)]: JSON.stringify({ data: { getAllCycleResults: rows } }),
      [page(100)]: JSON.stringify({ data: { getAllCycleResults: [crestRow('last', null)] } }),
    });
    const out = await client.listSchoolCrests();
    expect(out).toHaveLength(101);
    expect(out.at(-1)).toMatchObject({ slug: 'last', crestUrl: null, shortName: '' });
    expect(requestedPosts).toHaveLength(2);
    expect(SCHOOL_CRESTS.query).not.toMatch(/user_|display_name|profile_image/);
  });
});

describe('member-scoped keys (owner 2026-11-23)', () => {
  const memberKey = (user: string, school: string, cycle: number, type: string) =>
    dedupeHash(SECRET, 'ADMIT', `author:${user}:${school}:${cycle}:${type}`);

  it('a feed item keys on member, school, cycle and type, not on the update id', async () => {
    const { client } = setup(
      feedRoute([
        row({ cycle_update_id: 'upd-1' }),
        row({ cycle_update_id: 'upd-2', current_status_date: '2026-11-18T12:00:00.000Z' }),
        row({ cycle_update_id: 'upd-3', user_id: 'u-2' }),
        row({ cycle_update_id: 'upd-4', current_status: 'INTERVIEW' }),
      ]),
    );
    const { items } = await client.fetchFeed();
    const k = items.map((i) => i.keyFor('s1'));
    expect(k[0]).toBe(memberKey('u-1', 's1', 2027, 'ACCEPTANCE'));
    expect(k[1]).toBe(k[0]);
    expect(k[2]).toBe(memberKey('u-2', 's1', 2027, 'ACCEPTANCE'));
    expect(k[3]).toBe(memberKey('u-1', 's1', 2027, 'INTERVIEW'));
    expect(items[0]!.keyFor('s2')).not.toBe(k[0]);
    // The old per-update hash is still on the event, for authorless rows only.
    expect(items[0]!.event.dedupeHash).toBe(dedupeHash(SECRET, 'ADMIT', 'upd-1'));
  });

  it('a row with no author falls back to the per-update key', async () => {
    const { client } = setup(feedRoute([row({ user_id: null, cycle_update_id: 'upd-9' })]));
    const { items } = await client.fetchFeed();
    expect(items[0]!.keyFor('s1')).toBe(dedupeHash(SECRET, 'ADMIT', 'upd-9'));
  });

  it('memberHashOf is a keyed hash that is not the user id and not an event key', async () => {
    const { client } = setup(feedRoute([row()]));
    const { items } = await client.fetchFeed();
    const h = client.memberHashOf(items[0]!.lookup)!;
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(dedupeHash(SECRET, 'ADMIT', 'member:u-1'));
    expect(h).not.toBe(items[0]!.keyFor('s1'));
    expect(client.memberHashOf(null)).toBeNull();
  });
});

describe('profile history', () => {
  const profileBody = (history: unknown[] | null, mdPhd: boolean | null = false) =>
    JSON.stringify({ data: { getCycleTrackProfileByUserId: { md_phd: mdPhd, history } } });
  const ent = (over: Record<string, unknown> = {}) => ({
    school: { slug: 'harvard-medical-school' },
    secondary_submitted: null,
    interview_received: null,
    decision_date: null,
    decision: null,
    ...over,
  });
  const tokenFor = async (routes: Record<string, string | null>) => {
    const t = setup({ ...feedRoute([row()]), ...routes });
    const { items } = await t.client.fetchFeed();
    return { ...t, token: items[0]!.lookup };
  };

  it('maps secondary, interview and decision entries to typed, dated events with their cycle year', async () => {
    const { client, token } = await tokenFor({
      [flagKey('u-1')]: profileBody([
        ent({
          secondary_submitted: '2026-07-12T16:00:00.000Z',
          interview_received: '2026-10-02T16:00:00.000Z',
          decision_date: '2026-11-10T16:00:00.000Z',
          decision: 'ACCEPTED',
        }),
        ent({ school: { slug: 'yale' }, decision_date: '2026-08-20T16:00:00.000Z', decision: 'WAITLISTED' }),
        ent({ school: { slug: 'duke' }, decision_date: '2026-09-02T16:00:00.000Z', decision: 'HOLD' }),
      ]),
    });
    const p = await client.profileOf(token);
    if (p === 'FAILED') throw new Error('failed');
    expect(p.flag).toBe('REG');
    expect(
      p.history.map((h) => [h.schoolKey, h.eventType, h.occurredAt.toISOString().slice(0, 10), h.cycleYear]),
    ).toEqual([
      ['harvard-medical-school', 'SECONDARY', '2026-07-12', 2027],
      ['harvard-medical-school', 'INTERVIEW', '2026-10-02', 2027],
      ['harvard-medical-school', 'ACCEPTANCE', '2026-11-10', 2027],
      // a summer decision belongs to that August's class; September 1 rolls over
      ['yale', 'WAITLIST', '2026-08-20', 2026],
      ['duke', 'HOLD', '2026-09-02', 2027],
    ]);
    // day-only: stored at UTC midnight, never the form's 16:00Z
    expect(p.history.every((h) => h.occurredAt.getTime() % 86_400_000 === 0)).toBe(true);
    expect(p.history[0]!.keyFor('s1')).toBe(dedupeHash(SECRET, 'ADMIT', 'author:u-1:s1:2027:SECONDARY'));
    // the same key the feed builds for the same member, school, cycle and type
    const { items } = await client.fetchFeed();
    expect(p.history[2]!.keyFor('s1')).toBe(items[0]!.keyFor('s1'));
  });

  it('entries that cannot be dated are counted, never guessed', async () => {
    const { client, token } = await tokenFor({
      [flagKey('u-1')]: profileBody([
        ent({ decision: 'ACCEPTED' }),
        ent({ decision_date: '2026-11-10T00:00:00.000Z', decision: 'MAYBE' }),
        ent({ secondary_submitted: 'not a date' }),
        ent({ interview_received: '2030-01-01T00:00:00.000Z' }),
        { school: null },
      ]),
    });
    const p = await client.profileOf(token);
    if (p === 'FAILED') throw new Error('failed');
    expect(p.history).toEqual([]);
    expect(p.skipped).toEqual({ unknownDecision: 1, badDate: 3, malformedEntries: 1 });
  });

  it('a missing history is empty; a missing profile is UNREADABLE with no history', async () => {
    const a = await tokenFor({ [flagKey('u-1')]: profileBody(null) });
    expect(await a.client.profileOf(a.token)).toMatchObject({ flag: 'REG', history: [] });
    const b = await tokenFor({
      [flagKey('u-1')]: JSON.stringify({ data: { getCycleTrackProfileByUserId: null } }),
    });
    expect(await b.client.profileOf(b.token)).toMatchObject({ flag: 'UNREADABLE', history: [] });
  });

  it('the profile request selects md_phd and the history dates only', () => {
    expect(PROFILE_FLAG.query).toContain('md_phd');
    expect(PROFILE_FLAG.query).toContain('secondary_submitted');
    for (const f of ['display_name', 'avatar', 'profile_image', 'gpa', 'mcat', 'user_id', 'date_joined'])
      expect(PROFILE_FLAG.query).not.toContain(f);
  });

  it('hostile profile fixture: no person field or id appears in any returned value', async () => {
    const { client, token } = await tokenFor({ [flagKey('u-1')]: fx('profile-history-hostile') });
    const p = await client.profileOf(token);
    const dump = JSON.stringify(p);
    for (const n of [...NEEDLES, '3.987', '527', 'u-1']) expect(dump).not.toContain(n);
    if (p === 'FAILED') throw new Error('failed');
    expect(p.flag).toBe('PHD');
    expect(p.history).toHaveLength(5);
  });

  it('programOf and profileOf share one request per user', async () => {
    const { client, token, requestedPosts } = await tokenFor({ [flagKey('u-1')]: profileBody([]) });
    await client.programOf(token);
    await client.profileOf(token);
    expect(requestedPosts.filter((p) => p.op === PROFILE_FLAG.operationName)).toHaveLength(1);
  });
});

describe('discoverMembers', () => {
  const vars = (status: string, offset = 0) => ({ ...RESULT_USERS.variables, status: [status], limit: 100, offset });
  const body = (ids: Array<string | null>) =>
    JSON.stringify({ data: { getAllCycleResults: ids.map((user_id) => ({ user_id })) } });
  const STATUSES = ['INTERVIEW', 'ACCEPTED', 'WITHDRAWN', 'REJECTED', 'WAITLISTED', 'HOLD'];

  it('walks every status, pages to a short page, and returns each member once', async () => {
    const page0 = Array.from({ length: 100 }, (_, i) => `u${i}`);
    const routes: Record<string, string> = {};
    for (const st of STATUSES) routes[key(RESULT_USERS, vars(st))] = body(['shared', null, 'u-' + st]);
    routes[key(RESULT_USERS, vars('INTERVIEW'))] = body(page0);
    routes[key(RESULT_USERS, vars('INTERVIEW', 100))] = body(['u100', 'shared']);
    const { client, requestedPosts } = setup(routes);
    const found = await client.discoverMembers();
    expect(found.pages).toBe(7);
    expect(found.failedStatuses).toBe(0);
    // 102 from interview, 'shared' once, five other statuses one extra each
    expect(found.tokens).toHaveLength(101 + 1 + 5);
    expect(requestedPosts.every((p) => p.op === RESULT_USERS.operationName)).toBe(true);
    expect(JSON.stringify(found)).not.toContain('u100');
  });

  it('selects the user id and nothing else', () => {
    expect(RESULT_USERS.query).toContain('user_id');
    for (const f of ['display_name', 'profile_image', 'crest_url', 'school {', 'current_status'])
      expect(RESULT_USERS.query).not.toContain(f);
  });

  it('a status whose request fails is counted and skipped; a halt throws', async () => {
    const routes: Record<string, string | null> = {};
    for (const st of STATUSES) routes[key(RESULT_USERS, vars(st))] = body(['u-' + st]);
    routes[key(RESULT_USERS, vars('ACCEPTED'))] = JSON.stringify({ errors: [{ message: 'x' }], data: null });
    const ok = await setup(routes).client.discoverMembers();
    expect(ok.failedStatuses).toBe(1);
    expect(ok.tokens).toHaveLength(5);
    const halted = createFakeHost({}, 1);
    const client = createAdmitClient(halted.host.session(), { secret: SECRET, now: () => NOW });
    await expect(client.discoverMembers()).rejects.toBeInstanceOf(SourceHaltedError);
  });
});
