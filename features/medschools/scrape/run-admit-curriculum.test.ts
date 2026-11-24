import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADMIT_SOURCE_LABEL, ADMIT_SOURCE_URL, CURRICULUM_CYCLE, isCurriculumKind } from '../engine/school-facts';
import { ADMIT_GRAPHQL_PATH, SOURCES } from './sources';
import { createPoliteHost } from './http';
import { createDailyBudget } from './request-budget';
import { createFakeHost, createFakePrisma, gqlKey } from './test-support';
import {
  ADMIT_CURRICULUM_MIN_INTERVAL_MS,
  admitCurriculumOwed,
  runAdmitCurriculum,
  type AdmitCurriculumDeps,
} from './run-admit-curriculum';
import type { MedSchoolFactRow } from './types';

const body = readFileSync(join(__dirname, 'adapters/admit/__fixtures__/curriculum-all.json'), 'utf8');
const KEY = gqlKey(ADMIT_GRAPHQL_PATH, 'getAllSchoolCurriculum', {});
const NOW = new Date('2026-11-24T12:00:00.000Z');
const log = { info: () => undefined, warn: () => undefined, error: () => undefined };

function setup(reply: string | null = body) {
  const fake = createFakePrisma();
  fake.tables.medSchool!.push(
    { id: 's1', slug: 'alpha-md', active: true, degree: 'MD' },
    { id: 's2', slug: 'bravo-do', active: true, degree: 'DO' },
    { id: 's3', slug: 'closed', active: false, degree: 'MD' },
  );
  fake.tables.medSchoolAlias!.push(
    { id: 'a1', schoolId: 's1', source: 'ADMIT', sourceKey: 'fixture-alpha' },
    { id: 'a2', schoolId: 's2', source: 'ADMIT', sourceKey: 'fixture-bravo' },
    { id: 'a3', schoolId: 's3', source: 'ADMIT', sourceKey: 'fixture-charlie' },
  );
  const host = createFakeHost({ [KEY]: reply });
  const clock = { t: NOW };
  const run = (trigger: 'CRON' | 'MANUAL' | 'BOOTSTRAP' = 'MANUAL', over: Partial<AdmitCurriculumDeps> = {}) =>
    runAdmitCurriculum(
      { prisma: fake.prisma, host: host.host, shouldStop: () => false, log, now: () => clock.t, ...over },
      { trigger },
    );
  const facts = () => fake.tables.medSchoolFact as unknown as MedSchoolFactRow[];
  return { fake, host, run, clock, facts };
}

describe('runAdmitCurriculum', () => {
  it('makes one request, stores ADMIT facts per matched school and counts the rest', async () => {
    const t = setup();
    const r = await t.run();
    expect(r).toMatchObject({
      status: 'PARTIAL',
      outcome: 'ran',
      fetched: 7,
      malformedRows: 2,
      schools: 2,
      unmatched: 5,
      requests: 1,
    });
    expect(t.host.requestedPosts).toHaveLength(1);
    const rows = t.facts();
    expect(rows.every((f) => f.source === 'ADMIT' && isCurriculumKind(f.kind))).toBe(true);
    expect(new Set(rows.map((f) => f.schoolId))).toEqual(new Set(['s1', 's2']));
    const alpha = rows.find((f) => f.schoolId === 's1' && f.kind === 'CURRICULUM_CLERKSHIP_GRADING')!;
    expect(alpha).toMatchObject({
      valueText: 'P_F',
      valueJson: { text: 'P/F' },
      cycleYear: CURRICULUM_CYCLE,
      sourceUrl: ADMIT_SOURCE_URL,
      sourceLabel: ADMIT_SOURCE_LABEL,
      reportId: null,
      program: 'REG',
    });
    expect(alpha.checkedOn.toISOString()).toBe('2026-11-24T00:00:00.000Z');
    expect(rows.find((f) => f.kind === 'CURRICULUM_PRECLINICAL_LENGTH' && f.schoolId === 's1')).toMatchObject({
      valueNum: 1.5,
      valueText: null,
      valueJson: { text: '1.5 Years' },
    });
    // an inactive school and an unknown slug get nothing, and no alias-miss row is written
    expect(t.fake.tables.medSchoolAliasMiss ?? []).toHaveLength(0);
  });

  it('records one MedSourceRun and has no model call', async () => {
    const t = setup();
    await t.run('CRON');
    const runs = t.fake.tables.medSourceRun as Array<Record<string, unknown>>;
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ source: 'ADMIT', job: 'admit-curriculum', trigger: 'CRON' });
    expect(runs[0]!.stats).toMatchObject({ schools: 2, unmatched: 5 });
  });

  it('upserts in place on a second run and deletes only the kinds Admit stopped publishing', async () => {
    const t = setup();
    await t.run();
    const before = t.facts().filter((f) => f.schoolId === 's1').length;
    const ids = new Map(t.facts().map((f) => [`${f.schoolId}:${f.kind}`, f.id]));
    await t.run();
    expect(t.facts().filter((f) => f.schoolId === 's1')).toHaveLength(before);
    for (const f of t.facts()) expect(ids.get(`${f.schoolId}:${f.kind}`)).toBe(f.id);

    // Admit now has no AOA answer and no hospitals for alpha, and a new clerkship scale
    const raw = JSON.parse(body) as { data: { getAllSchoolCurriculum: Array<Record<string, unknown>> } };
    Object.assign(raw.data.getAllSchoolCurriculum[0]!, { aoa: null, home_hospital: null, clerk_grades: 'H/P/F' });
    const t2 = setup(JSON.stringify(raw));
    t2.fake.tables.medSchoolFact = t.facts().map((f) => ({ ...f }));
    await t2.run();
    const kinds = t2
      .facts()
      .filter((f) => f.schoolId === 's1')
      .map((f) => f.kind);
    expect(kinds).not.toContain('AOA_CHAPTER');
    expect(kinds).not.toContain('HOME_HOSPITALS');
    expect(t2.facts().find((f) => f.schoolId === 's1' && f.kind === 'CURRICULUM_CLERKSHIP_GRADING')).toMatchObject({
      valueText: 'H_P_F',
    });
    // bravo (not changed) keeps everything
    expect(t2.facts().filter((f) => f.schoolId === 's2').length).toBe(
      t.facts().filter((f) => f.schoolId === 's2').length,
    );
  });

  it('never deletes or changes an AAMC row, even for a school it refreshes', async () => {
    const t = setup();
    const aamc = {
      id: 'aamc-1',
      schoolId: 's1',
      program: 'REG',
      cycleYear: 2027,
      kind: 'ACCEPTS_OUT_OF_STATE',
      valueNum: null,
      valueText: 'YES',
      valueJson: null,
      note: null,
      source: 'AAMC_MSAR_REPORT',
      sourceUrl: 'https://example.org',
      sourceLabel: 'x',
      reportId: 6996,
      page: 2,
      checkedOn: new Date('2026-11-24'),
    };
    const staleAdmit = {
      ...aamc,
      id: 'admit-old',
      kind: 'CURRICULUM_MSPE',
      source: 'ADMIT',
      cycleYear: 0,
      reportId: null,
      valueText: 'YES',
    };
    // a same-kind-name AAMC row must also survive; an ADMIT row of a kind no longer published must go
    t.fake.tables.medSchoolFact!.push(
      aamc,
      { ...aamc, id: 'aamc-2', kind: 'COA_IN_STATE', valueNum: 1, valueText: null },
      staleAdmit,
    );
    const raw = JSON.parse(body) as { data: { getAllSchoolCurriculum: Array<Record<string, unknown>> } };
    Object.assign(raw.data.getAllSchoolCurriculum[0]!, { mspe: null });
    const t2 = setup(JSON.stringify(raw));
    t2.fake.tables.medSchoolFact = [...t.facts()];
    await t2.run();
    expect(
      t2
        .facts()
        .filter((f) => f.source === 'AAMC_MSAR_REPORT')
        .map((f) => f.id)
        .sort(),
    ).toEqual(['aamc-1', 'aamc-2']);
    expect(t2.facts().find((f) => f.id === 'admit-old')).toBeUndefined();
  });

  it('a failed reply writes nothing and deletes nothing', async () => {
    const t = setup(JSON.stringify({ data: { getAllSchoolCurriculum: [] } }));
    t.fake.tables.medSchoolFact!.push({ id: 'keep', schoolId: 's1', source: 'ADMIT', kind: 'AOA_CHAPTER' });
    const r = await t.run();
    expect(r.status).toBe('FAILED');
    expect(t.facts().map((f) => f.id)).toEqual(['keep']);
    expect((t.fake.tables.medSourceRun as Array<Record<string, unknown>>)[0]).toMatchObject({ status: 'FAILED' });
  });

  it('a school missing from the reply keeps its rows', async () => {
    const t = setup();
    await t.run();
    const raw = JSON.parse(body) as { data: { getAllSchoolCurriculum: unknown[] } };
    raw.data.getAllSchoolCurriculum = raw.data.getAllSchoolCurriculum.slice(0, 1);
    const t2 = setup(JSON.stringify(raw));
    t2.fake.tables.medSchoolFact = t.facts().map((f) => ({ ...f }));
    await t2.run();
    expect(t2.facts().filter((f) => f.schoolId === 's2').length).toBeGreaterThan(0);
  });
});

describe('once per interval and the first run', () => {
  it('a scheduled run inside the interval of a real run is skipped with no request; a manual one is not', async () => {
    const t = setup();
    expect(await admitCurriculumOwed(t.fake.prisma)).toBe(true);
    const first = await t.run('CRON');
    expect(first.outcome).toBe('ran');
    expect(await admitCurriculumOwed(t.fake.prisma)).toBe(false);
    t.clock.t = new Date(NOW.getTime() + ADMIT_CURRICULUM_MIN_INTERVAL_MS - 60_000);
    const early = await t.run('CRON');
    expect(early).toMatchObject({ outcome: 'skipped-min-interval', status: 'OK' });
    expect(t.host.requestedPosts).toHaveLength(1);
    // the skipped row does not extend the window
    t.clock.t = new Date(NOW.getTime() + ADMIT_CURRICULUM_MIN_INTERVAL_MS + 60_000);
    expect((await t.run('CRON')).outcome).toBe('ran');
    expect(t.host.requestedPosts).toHaveLength(2);
    const manual = await t.run('MANUAL');
    expect(manual.outcome).toBe('ran');
  });

  it('a failed first run leaves the first run owed', async () => {
    const t = setup(null);
    await t.run('BOOTSTRAP');
    expect(await admitCurriculumOwed(t.fake.prisma)).toBe(true);
  });
});

describe('the Admit host budget', () => {
  const realHost = (limit: number, fake: ReturnType<typeof createFakePrisma>) => {
    const calls: string[] = [];
    const budget = createDailyBudget(
      fake.prisma,
      'ADMIT',
      () => limit,
      () => NOW,
    );
    const host = createPoliteHost(SOURCES.ADMIT, {
      budget,
      sleep: async () => undefined,
      fetchImpl: (async (url: string) => {
        calls.push(String(url));
        if (String(url).endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /\n', { status: 200 });
        return new Response(body, { status: 200 });
      }) as unknown as typeof fetch,
    });
    return { host, budget, calls };
  };

  it('spends the host budget (robots.txt and the query) and no more than one query', async () => {
    const t = setup();
    const h = realHost(10, t.fake);
    const r = await t.run('MANUAL', { host: h.host });
    expect(r.requests).toBe(1);
    expect(h.calls.filter((c) => c.endsWith('/graphql'))).toHaveLength(1);
    expect(await h.budget.used()).toBe(2);
  });

  it('a spent daily budget ends the run FAILED with nothing written', async () => {
    const t = setup();
    const h = realHost(0, t.fake);
    const r = await t.run('MANUAL', { host: h.host });
    expect(r.status).toBe('FAILED');
    expect(h.calls).toHaveLength(0);
    expect(t.facts()).toHaveLength(0);
  });
});
