import { describe, expect, it } from 'vitest';
import { dedupeHash } from '../engine/dedupe';
import { SCHOOL_CYCLE_RESULTS } from './adapters/admit/queries';
import {
  entryYearOf,
  runAdmitSchoolResults,
  schoolResultsJob,
  schoolResultsPastOwed,
  schoolResultsYears,
  type AdmitSchoolResultsDeps,
  type SchoolResultsKind,
} from './run-admit-school-results';
import { ADMIT_GRAPHQL_PATH } from './sources';
import { assertNoLeak, createFakeHost, createFakePrisma, gqlKey, NEEDLES } from './test-support';

const SECRET = 'test-secret-0123456789abcdef';
const NOW = new Date('2026-11-23T05:50:00.000Z');
const SUMMER = new Date('2026-07-15T05:50:00.000Z');
const mk = (user: string, school: string, cycle: number, type: string) =>
  dedupeHash(SECRET, 'ADMIT', `author:${user}:${school}:${cycle}:${type}`);

const key = (slug: string, year: number) =>
  gqlKey(ADMIT_GRAPHQL_PATH, SCHOOL_CYCLE_RESULTS.operationName, { slug, year });
const row = (over: Record<string, unknown> = {}) => ({
  user_id: 'u1',
  md_phd: false,
  secondary_submitted: null,
  interview_received: null,
  decision_date: null,
  decision: null,
  ...over,
});
const page = (rows: unknown[], totals: Partial<Record<string, number | null>> = {}) =>
  JSON.stringify({
    data: {
      getCycleResultsBySchool: {
        total_applications: 836,
        num_of_interviews: 220,
        num_of_acceptances: 15,
        num_of_rejections: 211,
        ...totals,
        current_applicants: rows,
      },
    },
  });
const NO_PAGE = JSON.stringify({ data: { getCycleResultsBySchool: null } });

function setup(routes: Record<string, string | null>, now = NOW, fail = 3) {
  const fake = createFakePrisma();
  fake.tables.medSchool!.push({ id: 's1', slug: 'nyu', active: true }, { id: 's2', slug: 'yale', active: true });
  fake.tables.medSchoolAlias!.push(
    { id: 'a1', schoolId: 's1', source: 'ADMIT', sourceKey: 'new-york-university-grossman-school-of-medicine' },
    { id: 'a2', schoolId: 's2', source: 'ADMIT', sourceKey: 'yale-school-of-medicine' },
  );
  const host = createFakeHost((p) => routes[p] ?? null, fail);
  const logs: string[] = [];
  const log = {
    info: (l: string) => logs.push(l),
    warn: (l: string) => logs.push(l),
    error: (l: string) => logs.push(l),
  };
  const run = (kind: SchoolResultsKind = 'current', over: Partial<AdmitSchoolResultsDeps> = {}) =>
    runAdmitSchoolResults(
      { prisma: fake.prisma, host: host.host, secret: SECRET, shouldStop: () => false, log, now: () => now, ...over },
      { kind, trigger: 'MANUAL' },
    );
  const events = () => fake.tables.medCycleEvent! as Array<Record<string, unknown>>;
  const totals = () => fake.tables.medAdmitCycleTotal! as Array<Record<string, unknown>>;
  const asked = () =>
    host.requestedPosts.filter((p) => p.op === SCHOOL_CYCLE_RESULTS.operationName).map((p) => p.variables);
  return { ...fake, ...host, run, logs, events, totals, asked };
}

const NYU = 'new-york-university-grossman-school-of-medicine';
const YALE = 'yale-school-of-medicine';

describe('schoolResultsYears', () => {
  it('the daily run is the cycle in progress; through the summer it also reads the one before', () => {
    expect(schoolResultsYears('current', NOW)).toEqual([2026]);
    expect(schoolResultsYears('current', new Date('2027-01-10T00:00:00Z'))).toEqual([2026]);
    expect(schoolResultsYears('current', SUMMER)).toEqual([2026, 2025]);
    expect(schoolResultsYears('current', new Date('2026-09-02T00:00:00Z'))).toEqual([2026]);
  });
  it('the one-time past run is the two cycles before the current one', () => {
    expect(schoolResultsYears('past', NOW)).toEqual([2025, 2024]);
  });
  it('the site stores a cycle by its entry year', () => {
    expect(entryYearOf(2026)).toBe(2027);
  });
});

describe('runAdmitSchoolResults', () => {
  it('turns a school page into member-keyed events with the md_phd program, and stores Admit totals', async () => {
    const t = setup({
      [key(NYU, 2026)]: page([
        row({
          user_id: 'u1',
          md_phd: true,
          secondary_submitted: '2026-07-12T16:00:00.000Z',
          interview_received: '2026-10-02T16:00:00.000Z',
          decision_date: '2026-11-10T16:00:00.000Z',
          decision: 'ACCEPTED',
        }),
        row({ user_id: 'u2', interview_received: '2026-10-05T16:00:00.000Z' }),
        row({ user_id: null, interview_received: '2026-10-06T16:00:00.000Z' }),
      ]),
      [key(YALE, 2026)]: NO_PAGE,
    });
    const s = await t.run();
    expect(s).toMatchObject({
      status: 'OK',
      kind: 'current',
      years: [2026],
      schools: 2,
      fetched: 1,
      noPage: 1,
      skippedRows: 1,
      eventsCreated: 4,
      remaining: 0,
      totalsWritten: 1,
    });
    expect(
      t
        .events()
        .map((e) => e.dedupeHash)
        .sort(),
    ).toEqual(
      [
        mk('u1', 's1', 2027, 'SECONDARY'),
        mk('u1', 's1', 2027, 'INTERVIEW'),
        mk('u1', 's1', 2027, 'ACCEPTANCE'),
        mk('u2', 's1', 2027, 'INTERVIEW'),
      ].sort(),
    );
    const byUser = (u: string) =>
      t.events().filter((e) => String(e.dedupeHash).length > 0 && e.dedupeHash === mk(u, 's1', 2027, 'INTERVIEW'))[0];
    expect(byUser('u1')).toMatchObject({ program: 'PHD', source: 'ADMIT' });
    expect(byUser('u2')).toMatchObject({ program: 'REG', source: 'ADMIT' });
    // Admit's printed totals, stored under the entry year
    expect(t.totals()).toEqual([
      expect.objectContaining({
        schoolId: 's1',
        cycleYear: 2027,
        applications: 836,
        interviews: 220,
        acceptances: 15,
        rejections: 211,
      }),
    ]);
    // one request per school and cycle, on the polite backfill session
    expect(t.asked()).toEqual([
      { slug: NYU, year: 2026 },
      { slug: YALE, year: 2026 },
    ]);
    expect(t.sessions).toEqual([{ spacingMs: 3000, jitterMs: 1000 }]);
  });

  it('a repeat run counts nothing twice (the member key is the same one the feed and the history use)', async () => {
    const t = setup({
      [key(NYU, 2026)]: page([row({ interview_received: '2026-10-02T16:00:00.000Z' })]),
      [key(YALE, 2026)]: NO_PAGE,
    });
    await t.run();
    const second = await t.run();
    expect(second).toMatchObject({ status: 'OK', eventsCreated: 0, eventsExisting: 1 });
    expect(t.events()).toHaveLength(1);
    expect(t.totals()).toHaveLength(1);
  });

  it('the past run asks for the two earlier cycles and is owed until one run finishes OK', async () => {
    const t = setup({
      [key(NYU, 2025)]: page([row({ interview_received: '2025-10-02T16:00:00.000Z' })], { num_of_interviews: 180 }),
      [key(NYU, 2024)]: page([row({ user_id: 'u9', interview_received: '2024-10-02T16:00:00.000Z' })]),
      [key(YALE, 2025)]: NO_PAGE,
      [key(YALE, 2024)]: NO_PAGE,
    });
    expect(await schoolResultsPastOwed(t.prisma)).toBe(true);
    const s = await t.run('past');
    expect(s).toMatchObject({
      status: 'OK',
      kind: 'past',
      years: [2025, 2024],
      fetched: 2,
      noPage: 2,
      eventsCreated: 2,
    });
    expect(t.asked()).toHaveLength(4);
    expect(
      t
        .totals()
        .map((r) => [r.cycleYear, r.interviews])
        .sort(),
    ).toEqual([
      [2025, 220],
      [2026, 180],
    ]);
    expect(
      t
        .events()
        .map((e) => e.cycleYear)
        .sort(),
    ).toEqual([2025, 2026]);
    expect(await schoolResultsPastOwed(t.prisma)).toBe(false);
    expect((t.tables.medSourceRun as Array<{ job: string }>).some((r) => r.job === schoolResultsJob('past'))).toBe(
      true,
    );
  });

  it('a past run that stops early is PARTIAL, so it stays owed', async () => {
    const t = setup({ [key(NYU, 2025)]: page([]), [key(YALE, 2025)]: NO_PAGE });
    let calls = 0;
    const s = await t.run('past', { shouldStop: () => ++calls > 1 });
    expect(s.status).toBe('PARTIAL');
    expect(s.remaining).toBeGreaterThan(0);
    expect(await schoolResultsPastOwed(t.prisma)).toBe(true);
  });

  it('through the summer the daily run reads the previous cycle too', async () => {
    const t = setup(
      Object.fromEntries([NYU, YALE].flatMap((slug) => [2026, 2025].map((y) => [key(slug, y), NO_PAGE] as const))),
      SUMMER,
    );
    await t.run();
    expect(t.asked().map((v) => (v as { year: number }).year)).toEqual([2026, 2026, 2025, 2025]);
  });

  it('refuses to run without the dedupe secret', async () => {
    const t = setup({});
    const s = await t.run('current', { secret: 'short' });
    expect(s.status).toBe('FAILED');
    expect(t.asked()).toEqual([]);
  });

  it('a failing school is counted and the run ends PARTIAL; the others still land', async () => {
    const t = setup({
      [key(NYU, 2026)]: '{"errors":[{"message":"boom"}],"data":null}',
      [key(YALE, 2026)]: page([row({ user_id: 'u3', interview_received: '2026-10-05T16:00:00.000Z' })]),
    });
    const s = await t.run();
    expect(s).toMatchObject({ status: 'PARTIAL', failed: 1, fetched: 1, eventsCreated: 1 });
  });

  it('writes and logs no person: the query asks for no name, avatar or score, and no id is stored', async () => {
    const t = setup({
      [key(NYU, 2026)]: page([row({ user_id: 'u-secret-77', interview_received: '2026-10-02T16:00:00.000Z' })]),
      [key(YALE, 2026)]: NO_PAGE,
    });
    await t.run();
    assertNoLeak(t.writes, [...NEEDLES, 'u-secret-77']);
    assertNoLeak([t.tables], [...NEEDLES, 'u-secret-77']);
    assertNoLeak(t.logs, [...NEEDLES, 'u-secret-77']);
    expect(SCHOOL_CYCLE_RESULTS.query).not.toMatch(/display_name|avatar|admit_score/);
    expect(JSON.stringify([t.writes, t.tables])).not.toContain('user_id');
  });
});
