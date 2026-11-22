import { describe, expect, it } from 'vitest';
import { schoolUrl, summaryUrl } from './adapters/cycletrack';
import { needsBackfill, runBackfill } from './run-backfill';
import { createFakeHost, createFakePrisma, loadFixture } from './test-support';
import type { Logger } from './types';

const log: Logger = {
  info() {},
  warn() {},
  error() {},
};
const CHALLENGE = '<html><title>Just a moment...</title></html>';

// Key order: A.T. Still - Arizona, Alabama COM, Yale.
const SCHOOLS = [
  {
    id: 'sch_a',
    key: 'A.T. Still - Arizona',
    fixture: 'atsu-arizona.html',
  },
  {
    id: 'sch_b',
    key: 'Alabama COM',
    fixture: 'alabama-com.html',
  },
  {
    id: 'sch_c',
    key: 'Yale',
    fixture: 'yale.html',
  },
];

type Row = {
  id: string;
  status: string;
  stats: Record<string, unknown> | null;
  error: string | null;
};

function setup(
  fixtures: Record<string, string | null> = {
    Yale: 'yale.html',
  },
) {
  const fake = createFakePrisma();
  for (const s of SCHOOLS) {
    fake.tables.medSchool!.push({
      id: s.id,
      slug: s.id,
      name: s.key,
      active: true,
    });
    fake.tables.medSchoolAlias!.push({
      id: `al_${s.id}`,
      schoolId: s.id,
      source: 'CYCLETRACK',
      sourceKey: s.key,
    });
  }
  const routes: Record<string, string | null> = {};
  for (const s of SCHOOLS) {
    const f = fixtures[s.key];
    routes[schoolUrl(s.key)] = f ? (f === 'CHALLENGE' ? CHALLENGE : loadFixture(f)) : null;
  }
  routes[summaryUrl('Yale', 'reg')] = loadFixture('yale-summary.json');
  return {
    ...fake,
    routes,
    runs: () => fake.tables.medSourceRun as Row[],
  };
}

const run = (s: ReturnType<typeof setup>, host: ReturnType<typeof createFakeHost>['host'], shouldStop = () => false) =>
  runBackfill(
    {
      prisma: s.prisma,
      cycletrack: host,
      shouldStop,
      log,
    },
    {
      trigger: 'MANUAL',
    },
  );
const stopAfter = (n: number) => {
  let calls = 0;
  return () => calls++ >= n;
};

describe('runBackfill', () => {
  it('ingests schools that have a page and skips 404s without counting a failure', async () => {
    const s = setup();
    const { host } = createFakeHost(s.routes);
    const r = await run(s, host);
    expect(r.status).toBe('OK');
    expect(r.cursor).toEqual({
      stage: 'done',
      index: 3,
      lastKey: 'Yale',
    });
    expect(r.created).toBe(s.tables.medCycleCount!.length);
    expect(r.created).toBeGreaterThan(0);
    const stats = s.runs()[0]!.stats!;
    expect(stats.skipped).toEqual(['A.T. Still - Arizona', 'Alabama COM']);
    expect(stats.failed).toBe(0);
  });

  it('keeps REG and PHD separate as the page reports them', async () => {
    const s = setup();
    await run(s, createFakeHost(s.routes).host);
    const programs = new Set(
      (
        s.tables.medCycleCount as Array<{
          program: string;
        }>
      ).map((c) => c.program),
    );
    expect(programs).toEqual(new Set(['REG', 'PHD']));
  });

  it('spaces requests by the backfill spacing', async () => {
    const s = setup();
    const { host, sessions } = createFakeHost(s.routes);
    await run(s, host);
    expect(sessions).toEqual([
      {
        spacingMs: 2000,
      },
    ]);
  });

  it('fetches summary.json reg always and phd only when the page has a PhD section', async () => {
    const s = setup({
      'Alabama COM': 'alabama-com.html',
      Yale: 'yale.html',
    });
    const { host, requested } = createFakeHost(s.routes);
    await run(s, host);
    expect(requested.filter((p) => p.includes('summary.json'))).toEqual([
      summaryUrl('Alabama COM', 'reg'),
      summaryUrl('Yale', 'reg'),
      summaryUrl('Yale', 'phd'),
    ]);
  });

  it('adds a summary cycle the page did not provide, and nothing when the cycles match', async () => {
    const plain = setup();
    await run(plain, createFakeHost(plain.routes).host);
    const base = plain.tables.medCycleCount!.length;

    const s = setup();
    const old = {
      ...(JSON.parse(loadFixture('yale-summary.json')) as object),
      cycle: '2024-2025',
    };
    s.routes[summaryUrl('Yale', 'reg')] = JSON.stringify(old);
    await run(s, createFakeHost(s.routes).host);
    const rows = s.tables.medCycleCount as Array<{
      program: string;
      cycleYear: number;
    }>;
    expect(rows.length).toBeGreaterThan(base);
    expect(rows.some((r) => r.program === 'REG' && r.cycleYear === 2025)).toBe(true);
  });

  it('resumes from the cursor after an interrupted run', async () => {
    const s = setup({
      'A.T. Still - Arizona': 'atsu-arizona.html',
      'Alabama COM': 'alabama-com.html',
      Yale: 'yale.html',
    });
    const first = createFakeHost(s.routes);
    const r1 = await run(s, first.host, stopAfter(1));
    expect(r1.status).toBe('PARTIAL');
    expect(r1.cursor).toEqual({
      stage: 'cycletrack',
      index: 1,
      lastKey: 'A.T. Still - Arizona',
    });

    const second = createFakeHost(s.routes);
    const r2 = await run(s, second.host);
    expect(r2.status).toBe('OK');
    expect(r2.cursor.stage).toBe('done');
    expect(second.requested.some((p) => p === schoolUrl('A.T. Still - Arizona'))).toBe(false);
    expect(second.requested.filter((p) => p.endsWith('/Alabama%20COM') || p === schoolUrl('Alabama COM'))).toHaveLength(
      1,
    );
    expect(second.requested).toContain(schoolUrl('Yale'));
  });

  it('a stale RUNNING predecessor is marked FAILED(interrupted) and resumed', async () => {
    const s = setup({
      'A.T. Still - Arizona': 'atsu-arizona.html',
      'Alabama COM': 'alabama-com.html',
      Yale: 'yale.html',
    });
    s.tables.medSourceRun!.push({
      id: 'old',
      source: 'CYCLETRACK',
      job: 'backfill',
      status: 'RUNNING',
      stats: {
        cursor: {
          stage: 'cycletrack',
          index: 2,
          lastKey: 'Alabama COM',
        },
        attempted: ['A.T. Still - Arizona', 'Alabama COM'],
      },
      error: null,
    });
    const { host, requested } = createFakeHost(s.routes);
    const r = await run(s, host);
    expect(r.status).toBe('OK');
    const old = s.runs().find((x) => x.id === 'old')!;
    expect(old.status).toBe('FAILED');
    expect(old.error).toBe('interrupted');
    expect(requested.filter((p) => p === schoolUrl('Yale'))).toHaveLength(1);
    expect(requested).not.toContain(schoolUrl('A.T. Still - Arizona'));
  });

  it('a done backfill is a no-op recorded OK', async () => {
    const s = setup();
    await run(s, createFakeHost(s.routes).host);
    const again = createFakeHost(s.routes);
    const r = await run(s, again.host);
    expect(r.status).toBe('OK');
    expect(r.cursor.stage).toBe('done');
    expect(again.requested).toEqual([]);
    expect(again.sessions).toEqual([]);
    expect(s.runs()).toHaveLength(2);
    expect(s.runs()[1]!.status).toBe('OK');
  });

  it('needsBackfill is true until a backfill is done; hourly counts never mask it', async () => {
    const s = setup();
    expect(await needsBackfill(s.prisma)).toBe(true);
    s.tables.medCycleCount!.push({
      id: 'c1',
      source: 'CYCLETRACK',
    });
    expect(await needsBackfill(s.prisma)).toBe(true);
    await run(s, createFakeHost(s.routes).host, stopAfter(1));
    expect(await needsBackfill(s.prisma)).toBe(true);
    await run(s, createFakeHost(s.routes).host);
    expect(await needsBackfill(s.prisma)).toBe(false);
  });

  it('three consecutive failures stop the stage and leave the cursor on the failing school', async () => {
    const s = setup({
      'A.T. Still - Arizona': 'CHALLENGE',
      'Alabama COM': 'CHALLENGE',
      Yale: 'CHALLENGE',
    });
    const { host, requested } = createFakeHost(s.routes);
    const r = await run(s, host);
    expect(r.status).toBe('PARTIAL');
    expect(r.cursor).toEqual({
      stage: 'cycletrack',
      index: 2,
      lastKey: 'Alabama COM',
    });
    expect(requested).toEqual([schoolUrl('A.T. Still - Arizona'), schoolUrl('Alabama COM'), schoolUrl('Yale')]);
    const row = s.runs()[0]!;
    expect(row.stats!.halted).toBe(true);
    expect(row.stats!.skipped).toEqual(['A.T. Still - Arizona', 'Alabama COM']);
    expect(row.error).toBeTruthy();
  });

  it('a failed school is skipped, the walk goes on, and it is retried once at the end', async () => {
    const s = setup({
      'A.T. Still - Arizona': 'CHALLENGE',
      'Alabama COM': 'alabama-com.html',
      Yale: 'yale.html',
    });
    const { host, requested } = createFakeHost(s.routes);
    const r = await run(s, host);
    expect(r.status).toBe('OK');
    expect(requested.filter((p) => p === schoolUrl('A.T. Still - Arizona'))).toHaveLength(2);
    expect(s.runs()[0]!.stats!.skipped).toEqual(['A.T. Still - Arizona']);
    expect(r.cursor.stage).toBe('done');
  });

  it('a school that recovers on the retry leaves the skipped list', async () => {
    const s = setup({
      'A.T. Still - Arizona': 'CHALLENGE',
      Yale: 'yale.html',
    });
    const url = schoolUrl('A.T. Still - Arizona');
    let seen = 0;
    const { host } = createFakeHost((p) => {
      if (p === url) return seen++ === 0 ? CHALLENGE : loadFixture('atsu-arizona.html');
      return s.routes[p] ?? null;
    });
    await run(s, host);
    expect(s.runs()[0]!.stats!.skipped).toEqual(['Alabama COM']);
    expect(
      (
        s.tables.medCycleCount as Array<{
          schoolId: string;
        }>
      ).some((c) => c.schoolId === 'sch_a'),
    ).toBe(true);
  });

  it('re-running over already ingested data writes nothing', async () => {
    const s = setup();
    await run(s, createFakeHost(s.routes).host);
    s.tables.medSourceRun!.length = 0;
    const before = s.writes.length;
    const countBefore = s.tables.medCycleCount!.length;
    const r = await run(s, createFakeHost(s.routes).host);
    expect(r.status).toBe('OK');
    expect(r.created + r.updated + r.deleted).toBe(0);
    expect(s.tables.medCycleCount!.length).toBe(countBefore);
    const dataWrites = s.writes.slice(before).filter(
      (w) =>
        'data' in (w as object) &&
        Array.isArray(
          (
            w as {
              data: unknown;
            }
          ).data,
        ),
    );
    expect(dataWrites).toEqual([]);
  });
  it('does not retry a 404 school at the end of the stage', async () => {
    const s = setup();
    const { host, requested } = createFakeHost(s.routes);
    await run(s, host);
    expect(requested.filter((p) => p === schoolUrl('Alabama COM'))).toHaveLength(1);
    expect(requested.filter((p) => p === schoolUrl('A.T. Still - Arizona'))).toHaveLength(1);
  });

  it('resumes by key, so a school added before the cursor is fetched once at the end of the stage and nothing is repeated', async () => {
    const s = setup({
      'A.T. Still - Arizona': 'atsu-arizona.html',
      'Alabama COM': 'alabama-com.html',
      Yale: 'yale.html',
    });
    const r1 = await run(s, createFakeHost(s.routes).host, stopAfter(2));
    expect(r1.cursor).toEqual({
      stage: 'cycletrack',
      index: 2,
      lastKey: 'Alabama COM',
    });
    // A new school that sorts before the cursor appears between runs.
    s.tables.medSchool!.push({
      id: 'sch_new',
      slug: 'sch_new',
      name: 'A Early',
      active: true,
    });
    s.tables.medSchoolAlias!.push({
      id: 'al_new',
      schoolId: 'sch_new',
      source: 'CYCLETRACK',
      sourceKey: 'A Early',
    });
    const second = createFakeHost(s.routes);
    const r2 = await run(s, second.host);
    expect(r2.status).toBe('OK');
    expect(second.requested.filter((p) => !p.includes('summary.json'))).toEqual(
      // Yale is the unfinished school; 'A Early' (added before the cursor) is fetched once at the end; nothing repeats.
      [schoolUrl('Yale'), schoolUrl('A Early')],
    );
  });
  it('a summary.json that throws never discards the school page tables', async () => {
    const s = setup();
    const plain = setup();
    await run(plain, createFakeHost(plain.routes).host);
    s.routes[summaryUrl('Yale', 'reg')] = '{"availability":"available","daily":"nope"}';
    s.routes[summaryUrl('Yale', 'phd')] = 'not json at all';
    const r = await run(s, createFakeHost(s.routes).host);
    expect(r.status).toBe('OK');
    expect(s.tables.medCycleCount!.length).toBe(plain.tables.medCycleCount!.length);
    expect(s.runs()[0]!.stats!.skipped).toEqual(['A.T. Still - Arizona', 'Alabama COM']);
    expect(s.runs()[0]!.stats!.summaryFailed).toBe(2);
  });

  it('a summary.json with daily null (unavailable) leaves the page tables ingested and is not a failure', async () => {
    const s = setup();
    s.routes[summaryUrl('Yale', 'reg')] = loadFixture('arkansas-summary-phd-unavailable.json');
    s.routes[summaryUrl('Yale', 'phd')] = loadFixture('arkansas-summary-phd-unavailable.json');
    const r = await run(s, createFakeHost(s.routes).host);
    expect(r.status).toBe('OK');
    expect(s.tables.medCycleCount!.length).toBeGreaterThan(0);
    expect(s.runs()[0]!.stats!.summaryFailed).toBe(0);
  });
  it('a skipped school whose alias was removed is recorded, not retried against an empty school id', async () => {
    const s = setup({
      'A.T. Still - Arizona': 'atsu-arizona.html',
      'Alabama COM': 'CHALLENGE',
      Yale: 'yale.html',
    });
    await run(s, createFakeHost(s.routes).host, stopAfter(2));
    expect((s.runs()[0]!.stats!.skipped as string[]) ?? []).toContain('Alabama COM');
    // The alias goes away between runs (an admin merged the school).
    s.tables.medSchoolAlias!.splice(
      s.tables.medSchoolAlias!.findIndex(
        (a) =>
          (
            a as {
              sourceKey: string;
            }
          ).sourceKey === 'Alabama COM',
      ),
      1,
    );
    const second = createFakeHost(s.routes);
    const r2 = await run(s, second.host);
    expect(r2.status).toBe('OK');
    expect(second.requested).not.toContain(schoolUrl('Alabama COM'));
    const stats = s.runs()[s.runs().length - 1]!.stats!;
    expect(stats.aliasGone).toEqual(['Alabama COM']);
    expect(stats.skipped).toEqual([]);
    expect(
      (
        s.tables.medCycleCount as Array<{
          schoolId: string;
        }>
      ).some((c) => c.schoolId === ''),
    ).toBe(false);
  });

  it('two CYCLETRACK aliases on one school: only the first is fetched and stats.duplicateAliases = [second]', async () => {
    const s = setup();
    s.tables.medSchoolAlias!.push({
      id: 'al_dup',
      schoolId: SCHOOLS[2]!.id,
      source: 'CYCLETRACK',
      sourceKey: 'Yale Copy',
    });
    const { host, requested } = createFakeHost(s.routes);
    const r = await run(s, host);
    expect(r.schools).toBe(3);
    expect(requested).not.toContain(schoolUrl('Yale Copy'));
    expect(s.runs()[0]!.stats!.duplicateAliases).toEqual(['Yale Copy']);
  });
});
