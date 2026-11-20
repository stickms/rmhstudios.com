import { describe, expect, it } from 'vitest';
import { dedupeHash } from '../engine/dedupe';
import {
  INTERVIEW_FEEDBACK,
  INTERVIEW_OVERVIEW,
  INTERVIEW_QUESTIONS,
  INTERVIEW_SCHOOLS,
  SCHOOL_STATS,
  type AdmitOperation,
} from './adapters/admit/queries';
import { runAdmitInterviews, type AdmitInterviewsDeps } from './run-admit-interviews';
import { ADMIT_GRAPHQL_PATH } from './sources';
import { NEEDLES, assertNoLeak, createFakeHost, createFakePrisma, gqlKey } from './test-support';

const SECRET = 'test-secret-0123456789abcdef';
const NOW = new Date('2026-11-20T18:00:00.000Z');
const HARVARD = 'harvard-medical-school';
const YALE = 'yale-school-of-medicine';
const key = (op: AdmitOperation, vars: Record<string, unknown>) =>
  gqlKey(ADMIT_GRAPHQL_PATH, op.operationName, vars);
const statsKey = (filterBy: string) =>
  key(SCHOOL_STATS, { ...SCHOOL_STATS.variables, filterBy, page: 1, pageSize: 999 });
const schoolsKey = key(INTERVIEW_SCHOOLS, { ...INTERVIEW_SCHOOLS.variables, limit: 100, offset: 0 });
const slugKey = (op: AdmitOperation, slug: string) => key(op, { schoolSlug: slug });
const hashOf = (id: number) => dedupeHash(SECRET, 'ADMIT', `question:${id}`);

const statRow = (slug: string, type: string, over: Record<string, unknown> = {}) => ({
  id: 5101,
  school: { slug },
  application_number: 600,
  application_to_interview_pct: 0.15,
  interview_number: 90,
  interview_to_admitted_pct: 0.2,
  admitted_number: 17,
  mcat: 522,
  gpa: 3.95,
  residence_type: type,
  research_hours: 100.5,
  clinical_hours: null,
  non_clinical_hours: null,
  ...over,
});
const statsBody = (rows: unknown[]) => JSON.stringify({ data: { getSchoolStats: rows } });
const schoolEntry = (slug: string, count: number, total: number) => ({
  avg_interview_difficulty: 4.5,
  interview_count: count,
  total_interview_count: total,
  school: { slug, name: slug, shorthand_name: slug, city: 'X', state: 'MA' },
});
const schoolsBody = (entries: unknown[]) =>
  JSON.stringify({
    data: { getMedicalInterviewSchoolsOverview: { totalCount: entries.length, schools: entries } },
  });
const overviewBody = (count: number) =>
  JSON.stringify({
    data: {
      getMedicalInterviewOverview: {
        avg_interview_difficulty: 6.89,
        interview_count: count,
        interview_format: 'STANDARD',
        interview_type: 'OPEN_FILE',
        most_common_interview_sessions: 1,
        total_interview_count: 757,
      },
    },
  });
const feedbackBody = JSON.stringify({
  data: {
    getInterviewFeedbackForSchool: {
      positive: ['Friendly  staff'],
      negative: ['Long day'],
      before_interview: ['Read the website'],
    },
  },
});
const questionsBody = (qs: Array<[number, string, number]>) =>
  JSON.stringify({
    data: {
      getInterviewsForSchool: {
        questions: qs.map(([id, body, votes]) => ({ id, body, votes, user_id: 'user-hostile-9931' })),
      },
    },
  });

function setup(routes: Record<string, string | null>, deps: Partial<AdmitInterviewsDeps> = {}, maxFailures = 3) {
  const fake = createFakePrisma();
  fake.tables.medSchool!.push(
    { id: 's1', slug: 'harvard', active: true },
    { id: 's2', slug: 'yale', active: true },
    { id: 's3', slug: 'closed', active: false },
  );
  fake.tables.medSchoolAlias!.push(
    { id: 'a1', schoolId: 's1', source: 'ADMIT', sourceKey: HARVARD },
    { id: 'a2', schoolId: 's2', source: 'ADMIT', sourceKey: YALE },
    { id: 'a3', schoolId: 's3', source: 'ADMIT', sourceKey: 'closed-school' },
  );
  const live = { routes };
  const host = createFakeHost((p) => live.routes[p] ?? null, maxFailures);
  const logs: string[] = [];
  const log = {
    info: (l: string) => logs.push(l),
    warn: (l: string) => logs.push(l),
    error: (l: string) => logs.push(l),
  };
  const run = () =>
    runAdmitInterviews(
      {
        prisma: fake.prisma,
        host: host.host,
        secret: SECRET,
        shouldStop: () => false,
        log,
        now: () => NOW,
        ...deps,
      },
      { trigger: 'MANUAL' },
    );
  const table = (n: string) => (fake.tables[n] ?? []) as Array<Record<string, unknown>>;
  return { ...fake, ...host, live, run, logs, table };
}

/** Stats for every filter plus Harvard (and optionally Yale) interviews. */
function baseRoutes(over: Record<string, string | null> = {}): Record<string, string | null> {
  return {
    [statsKey('GLOBAL')]: statsBody([statRow(HARVARD, 'global'), statRow(YALE, 'global')]),
    [statsKey('IN_STATE')]: statsBody([statRow(HARVARD, 'in_state', { admitted_number: 2 })]),
    [statsKey('OUT_OF_STATE')]: statsBody([statRow(HARVARD, 'out_of_state', { admitted_number: null })]),
    [schoolsKey]: schoolsBody([schoolEntry(HARVARD, 10, 757)]),
    [slugKey(INTERVIEW_OVERVIEW, HARVARD)]: overviewBody(10),
    [slugKey(INTERVIEW_FEEDBACK, HARVARD)]: feedbackBody,
    [slugKey(INTERVIEW_QUESTIONS, HARVARD)]: questionsBody([
      [987654321, 'Why medicine?', 3],
      [987654322, 'Tell me about yourself', 5],
    ]),
    ...over,
  };
}

describe('runAdmitInterviews', () => {
  it('writes one stats row per school per residence with source ADMIT and program null', async () => {
    const t = setup(baseRoutes());
    const s = await t.run();
    expect(s.status).toBe('OK');
    const rows = t.table('medSchoolStats');
    expect(rows).toHaveLength(4);
    expect(s.statsRows).toBe(4);
    for (const r of rows) {
      expect(r).toMatchObject({ source: 'ADMIT', program: null, cycleYear: 2027 });
    }
    const g = rows.find((r) => r.schoolId === 's1' && r.residence === 'GLOBAL')!;
    expect(g).toMatchObject({
      applicationCount: 600,
      interviewCount: 90,
      admittedCount: 17,
      contributors: 17,
      gpaMedian: 3.95,
      mcatMedian: 522,
      interviewToAcceptancePct: 0.2,
      applicationToInterviewPct: 0.15,
      researchHours: 100.5,
      clinicalHours: null,
      sourceUpdatedAt: NOW,
    });
    expect(rows.find((r) => r.residence === 'OUT_OF_STATE')!.contributors).toBeNull();
  });

  it('admit stats and cycletrack stats for the same school/cycle coexist as separate rows', async () => {
    const t = setup(baseRoutes());
    t.table('medSchoolStats').push({
      id: 'ct1',
      schoolId: 's1',
      source: 'CYCLETRACK',
      residence: 'GLOBAL',
      program: 'REG',
      cycleYear: 2027,
    });
    await t.run();
    const rows = t.table('medSchoolStats');
    expect(rows.filter((r) => r.schoolId === 's1' && r.residence === 'GLOBAL')).toHaveLength(2);
    expect(rows.find((r) => r.id === 'ct1')).toMatchObject({ source: 'CYCLETRACK', program: 'REG' });
  });

  it('second run updates the same rows (no duplicates for program null) and writes nothing when unchanged', async () => {
    const t = setup(baseRoutes());
    await t.run();
    const before = JSON.stringify([
      t.table('medSchoolStats'),
      t.table('medInterviewProfile'),
      t.table('medInterviewQuestion'),
    ]);
    const s = await t.run();
    expect(t.table('medSchoolStats')).toHaveLength(4);
    expect(s.statsRows).toBe(0);
    expect(
      JSON.stringify([t.table('medSchoolStats'), t.table('medInterviewProfile'), t.table('medInterviewQuestion')]),
    ).toBe(before);
    // A changed figure updates in place.
    t.live.routes[statsKey('GLOBAL')] = statsBody([statRow(HARVARD, 'global', { gpa: 3.9 }), statRow(YALE, 'global')]);
    const s3 = await t.run();
    expect(s3.statsRows).toBe(1);
    expect(t.table('medSchoolStats')).toHaveLength(4);
    expect(t.table('medSchoolStats').find((r) => r.schoolId === 's1' && r.residence === 'GLOBAL')!.gpaMedian).toBe(3.9);
  });

  it('in-state and out-of-state counts are stored as published so the read-time k>=3 floor can apply', async () => {
    const t = setup(baseRoutes());
    await t.run();
    const inState = t.table('medSchoolStats').find((r) => r.residence === 'IN_STATE')!;
    expect(inState).toMatchObject({ admittedCount: 2, contributors: 2 });
  });

  it('skips and counts a row whose residence_type is unknown or mismatched', async () => {
    const t = setup(
      baseRoutes({
        [statsKey('GLOBAL')]: statsBody([
          statRow(HARVARD, 'global'),
          statRow(YALE, 'worldwide'),
          statRow(YALE, 'in_state'),
        ]),
      }),
    );
    const s = await t.run();
    expect(s.statsSkipped).toBe(2);
    expect(t.table('medSchoolStats').filter((r) => r.schoolId === 's2')).toHaveLength(0);
  });

  it('stats row with unknown slug is not written and records one miss', async () => {
    const t = setup(
      baseRoutes({
        [statsKey('GLOBAL')]: statsBody([statRow('mystery-school', 'global'), statRow(HARVARD, 'global')]),
        [statsKey('IN_STATE')]: statsBody([statRow('mystery-school', 'in_state')]),
      }),
    );
    const s = await t.run();
    expect(s.misses).toBe(1);
    expect(t.table('medSchoolAliasMiss')).toHaveLength(1);
    expect(t.table('medSchoolStats').some((r) => r.schoolId === undefined)).toBe(false);
  });

  it('profile upsert stores format, fileType, avgDifficulty, interviewCount and the three feedback arrays', async () => {
    const t = setup(baseRoutes());
    const s = await t.run();
    expect(s.schoolsFetched).toBe(1);
    expect(t.table('medInterviewProfile')).toHaveLength(1);
    expect(t.table('medInterviewProfile')[0]).toMatchObject({
      schoolId: 's1',
      source: 'ADMIT',
      format: 'STANDARD',
      fileType: 'OPEN_FILE',
      avgDifficulty: 6.89,
      interviewCount: 10,
      feedbackPositive: ['Friendly staff'],
      feedbackNegative: ['Long day'],
      feedbackBefore: ['Read the website'],
      fetchedAt: NOW,
    });
  });

  it('questions are stored with the keyed hash and no raw id', async () => {
    const t = setup(baseRoutes());
    const s = await t.run();
    expect(s.questionsCreated).toBe(2);
    const qs = t.table('medInterviewQuestion');
    expect(qs.map((q) => q.dedupeHash).sort()).toEqual([hashOf(987654321), hashOf(987654322)].sort());
    expect(qs[0]).toMatchObject({ source: 'ADMIT', schoolId: 's1', cycleYear: null });
    expect(JSON.stringify(qs)).not.toContain('987654321');
  });

  it('unchanged interview count within 6 days: no questions/feedback requests', async () => {
    const t = setup(baseRoutes());
    await t.run();
    const before = t.requestedPosts.length;
    const s = await t.run();
    expect(s.schoolsSkipped).toBe(1);
    const ops = t.requestedPosts.slice(before).map((p) => p.op);
    expect(ops).not.toContain('GetInterviewsForSchool');
    expect(ops).not.toContain('GetInterviewFeedbackForSchool');
    expect(ops).not.toContain('GetMedicalInterviewOverview');
  });

  it('refetches when the listed count changed or the profile is 6 days old', async () => {
    const t = setup(baseRoutes());
    await t.run();
    t.live.routes[schoolsKey] = schoolsBody([schoolEntry(HARVARD, 11, 758)]);
    expect((await t.run()).schoolsFetched).toBe(1);
    const old = setup(baseRoutes());
    await old.run();
    old.table('medInterviewProfile')[0]!.fetchedAt = new Date(NOW.getTime() - 7 * 86_400_000);
    expect((await old.run()).schoolsFetched).toBe(1);
  });

  it('a question dropped upstream is deleted; a failed fetch deletes nothing', async () => {
    const t = setup(baseRoutes());
    await t.run();
    t.live.routes[schoolsKey] = schoolsBody([schoolEntry(HARVARD, 11, 758)]);
    t.live.routes[slugKey(INTERVIEW_QUESTIONS, HARVARD)] = null;
    const failed = await t.run();
    expect(failed.schoolsFailed).toBe(1);
    expect(failed.status).toBe('PARTIAL');
    expect(failed.questionsDeleted).toBe(0);
    expect(t.table('medInterviewQuestion')).toHaveLength(2);
    t.live.routes[slugKey(INTERVIEW_QUESTIONS, HARVARD)] = questionsBody([[987654321, 'Why medicine?', 3]]);
    const ok = await t.run();
    expect(ok.questionsDeleted).toBe(1);
    expect(t.table('medInterviewQuestion').map((q) => q.dedupeHash)).toEqual([hashOf(987654321)]);
  });

  it('votes change updates in place', async () => {
    const t = setup(baseRoutes());
    await t.run();
    const id = t.table('medInterviewQuestion').find((q) => q.dedupeHash === hashOf(987654321))!.id;
    t.live.routes[schoolsKey] = schoolsBody([schoolEntry(HARVARD, 11, 758)]);
    t.live.routes[slugKey(INTERVIEW_QUESTIONS, HARVARD)] = questionsBody([
      [987654321, 'Why medicine?', 9],
      [987654322, 'Tell me about yourself', 5],
    ]);
    const s = await t.run();
    expect(s.questionsUpdated).toBe(1);
    expect(s.questionsCreated).toBe(0);
    expect(t.table('medInterviewQuestion')).toHaveLength(2);
    expect(t.table('medInterviewQuestion').find((q) => q.id === id)!.votes).toBe(9);
  });

  it('school with zero interviews is skipped', async () => {
    const t = setup(baseRoutes({ [schoolsKey]: schoolsBody([schoolEntry(HARVARD, 0, 0)]) }));
    const s = await t.run();
    expect(s.schoolsSkipped).toBe(1);
    expect(s.schoolsFetched).toBe(0);
    expect(t.table('medInterviewProfile')).toHaveLength(0);
    expect(t.requestedPosts.map((p) => p.op)).not.toContain('GetInterviewsForSchool');
  });

  it('halt mid-walk is PARTIAL and keeps what was written', async () => {
    const t = setup(
      baseRoutes({
        [schoolsKey]: schoolsBody([schoolEntry(HARVARD, 10, 757), schoolEntry(YALE, 5, 50)]),
        [slugKey(INTERVIEW_OVERVIEW, YALE)]: null,
        [slugKey(INTERVIEW_FEEDBACK, YALE)]: null,
        [slugKey(INTERVIEW_QUESTIONS, YALE)]: null,
      }),
      {},
      1,
    );
    const s = await t.run();
    // Harvard written; Yale's first failed request trips the (here one-strike) halt, which ends the walk.
    expect(t.table('medInterviewProfile')).toHaveLength(1);
    expect(s.status).toBe('PARTIAL');
    expect(t.table('medSourceRun')[0]!.error).toBeTruthy();
    expect(t.table('medSchoolStats')).toHaveLength(4);
  });

  it('shouldStop ends the walk PARTIAL', async () => {
    let calls = 0;
    const t = setup(baseRoutes(), { shouldStop: () => ++calls > 3 });
    const s = await t.run();
    expect(s.status).toBe('PARTIAL');
    expect(t.table('medInterviewProfile')).toHaveLength(0);
  });

  it('missing secret: FAILED, zero requests', async () => {
    const t = setup(baseRoutes(), { secret: 'short' });
    const s = await t.run();
    expect(s.status).toBe('FAILED');
    expect(s.requests).toBe(0);
    expect(t.requestedPosts).toHaveLength(0);
    expect(t.table('medSourceRun')).toHaveLength(0);
  });

  it('records the run with counters only', async () => {
    const t = setup(baseRoutes());
    const s = await t.run();
    const run = t.table('medSourceRun')[0]!;
    expect(run).toMatchObject({ job: 'interviews', source: 'ADMIT', status: 'OK' });
    expect(run.stats).toMatchObject({ statsRows: 4, schoolsFetched: 1, questionsCreated: 2 });
    expect(s.runId).toBe(run.id);
  });

  it('leak: written data contains no NEEDLES and no raw question id', async () => {
    const t = setup(
      baseRoutes({
        [statsKey('GLOBAL')]: statsBody([
          statRow(HARVARD, 'global', { user_id: 'user-hostile-9931', user_display_name: 'drsmith42' }),
        ]),
      }),
    );
    await t.run();
    assertNoLeak([...t.writes, t.table('medSchoolStats'), t.table('medInterviewQuestion'), t.logs], [
      ...NEEDLES,
      '987654321',
      '987654322',
    ]);
  });
});
