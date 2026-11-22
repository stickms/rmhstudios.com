import { describe, expect, it } from 'vitest';
import { schoolUrl } from './adapters/cycletrack';
import { runCycletrack } from './run-cycletrack';
import { createFakeHost, createFakePrisma, loadFixture } from './test-support';
import type { Logger } from './types';

const log: Logger = {
  info() {},
  warn() {},
  error() {},
};
const CHALLENGE = '<html><title>Just a moment...</title></html>';

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

function setup(
  extra: Array<{
    id: string;
    key: string;
    fixture: string;
  }> = [],
) {
  const fake = createFakePrisma();
  const all = [...SCHOOLS, ...extra];
  for (const s of all) {
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
  const routes: Record<string, string | null> = {
    '/explorer/first': loadFixture('first.html'),
  };
  for (const s of all) routes[schoolUrl(s.key)] = loadFixture(s.fixture);
  return {
    ...fake,
    routes,
    all,
  };
}

const counts = (tables: Record<string, unknown[]>) => tables.medCycleCount!.length;
const runRows = (tables: Record<string, unknown[]>) =>
  tables.medSourceRun as Array<{
    status: string;
    stats: Record<string, unknown>;
    error: string | null;
  }>;

describe('runCycletrack', () => {
  it('walks schools sequentially and records an OK run', async () => {
    const s = setup();
    const { host, requested } = createFakeHost(s.routes);
    const r = await runCycletrack(
      {
        prisma: s.prisma,
        host,
        shouldStop: () => false,
        log,
      },
      {
        trigger: 'MANUAL',
      },
    );
    expect(r.status).toBe('OK');
    expect(r.schools).toBe(3);
    expect(r.skippedUnchanged).toBe(false);
    expect(r.created).toBe(counts(s.tables));
    expect(r.created).toBeGreaterThan(0);
    expect(requested).toEqual([
      schoolUrl('A.T. Still - Arizona'),
      '/explorer/first',
      schoolUrl('Alabama COM'),
      schoolUrl('Yale'),
    ]);
    const run = runRows(s.tables)[0]!;
    expect(run.status).toBe('OK');
    expect(typeof run.stats.completedStamp).toBe('string');
  });

  it('a second run with an unchanged stamp makes exactly one request and records skippedUnchanged', async () => {
    const s = setup();
    await runCycletrack(
      {
        prisma: s.prisma,
        host: createFakeHost(s.routes).host,
        shouldStop: () => false,
        log,
      },
      {
        trigger: 'CRON',
      },
    );
    const writesBefore = s.writes.length;
    const second = createFakeHost(s.routes);
    const r = await runCycletrack(
      {
        prisma: s.prisma,
        host: second.host,
        shouldStop: () => false,
        log,
      },
      {
        trigger: 'CRON',
      },
    );
    expect(r.status).toBe('OK');
    expect(r.skippedUnchanged).toBe(true);
    expect(r.requests).toBe(1);
    expect(second.requested).toHaveLength(1);
    const runs = runRows(s.tables);
    expect(runs[1]!.stats.skippedUnchanged).toBe(true);
    expect(runs[1]!.stats.completedStamp).toBe(runs[0]!.stats.completedStamp);
    // only the run bookkeeping was written
    expect(s.writes.length - writesBefore).toBe(2);
  });

  it('a second run on a changed stamp re-walks and performs no count writes when counts are identical', async () => {
    const s = setup();
    await runCycletrack(
      {
        prisma: s.prisma,
        host: createFakeHost(s.routes).host,
        shouldStop: () => false,
        log,
      },
      {
        trigger: 'CRON',
      },
    );
    const key = schoolUrl('A.T. Still - Arizona');
    s.routes[key] = s.routes[key]!.replace(/(<time data-update-full datetime=")[^"]+/, '$12026-11-21T00:00:00+00:00');
    const before = counts(s.tables);
    const r = await runCycletrack(
      {
        prisma: s.prisma,
        host: createFakeHost(s.routes).host,
        shouldStop: () => false,
        log,
      },
      {
        trigger: 'CRON',
      },
    );
    expect(r.skippedUnchanged).toBe(false);
    expect(r.created + r.updated + r.deleted).toBe(0);
    expect(counts(s.tables)).toBe(before);
  });

  it('stores first-dates in MedSchoolStats', async () => {
    const s = setup();
    await runCycletrack(
      {
        prisma: s.prisma,
        host: createFakeHost(s.routes).host,
        shouldStop: () => false,
        log,
      },
      {
        trigger: 'MANUAL',
      },
    );
    const stats = s.tables.medSchoolStats as Array<Record<string, unknown>>;
    expect(stats.length).toBe(6);
    expect(new Set(stats.map((x) => x.program))).toEqual(new Set(['REG', 'PHD']));
    const yaleReg = stats.find((x) => x.schoolId === 'sch_c' && x.program === 'REG')!;
    expect(yaleReg.firstSecondaryOn).toBeInstanceOf(Date);
    expect(yaleReg.cycleYear).toBe(2027);
    expect(stats.every((x) => x.source === 'CYCLETRACK' && x.residence === 'GLOBAL')).toBe(true);
  });

  it('Toronto lands in MedSchoolAliasMiss and no MedSchool is created', async () => {
    const s = setup();
    await runCycletrack(
      {
        prisma: s.prisma,
        host: createFakeHost(s.routes).host,
        shouldStop: () => false,
        log,
      },
      {
        trigger: 'MANUAL',
      },
    );
    const misses = s.tables.medSchoolAliasMiss as Array<{
      sourceKey: string;
      seenCount: number;
    }>;
    expect(misses.some((m) => m.sourceKey === 'Toronto')).toBe(true);
    expect(s.tables.medSchool).toHaveLength(3);
    // a re-walk increments seenCount instead of duplicating
    const key = schoolUrl('Yale');
    s.routes[key] = s.routes[key]!.replace(/(<time data-update-full datetime=")[^"]+/, '$12030-01-01T00:00:00+00:00');
    s.routes[schoolUrl('A.T. Still - Arizona')] = s.routes[schoolUrl('A.T. Still - Arizona')]!.replace(
      /(<time data-update-full datetime=")[^"]+/,
      '$12030-01-01T00:00:00+00:00',
    );
    const n = misses.length;
    await runCycletrack(
      {
        prisma: s.prisma,
        host: createFakeHost(s.routes).host,
        shouldStop: () => false,
        log,
      },
      {
        trigger: 'MANUAL',
      },
    );
    expect((s.tables.medSchoolAliasMiss as unknown[]).length).toBe(n);
    expect(misses.find((m) => m.sourceKey === 'Toronto')!.seenCount).toBe(2);
  });

  it('stops with PARTIAL when shouldStop turns true mid-walk and does not store completedStamp', async () => {
    const s = setup();
    let calls = 0;
    const r = await runCycletrack(
      {
        prisma: s.prisma,
        host: createFakeHost(s.routes).host,
        shouldStop: () => ++calls > 1,
        log,
      },
      {
        trigger: 'CRON',
      },
    );
    expect(r.status).toBe('PARTIAL');
    expect(r.requests).toBe(2); // first page + explorer/first, nothing more
    expect(runRows(s.tables)[0]!.stats.completedStamp).toBeUndefined();
    expect(counts(s.tables)).toBeGreaterThan(0);
  });

  it('three unexpected pages halt the run', async () => {
    const s = setup([
      {
        id: 'sch_d',
        key: 'Zzz Fourth',
        fixture: 'yale.html',
      },
    ]);
    for (const x of s.all) s.routes[schoolUrl(x.key)] = CHALLENGE;
    const { host, requested } = createFakeHost(s.routes);
    const r = await runCycletrack(
      {
        prisma: s.prisma,
        host,
        shouldStop: () => false,
        log,
      },
      {
        trigger: 'CRON',
      },
    );
    expect(r.status).toBe('PARTIAL');
    expect(requested).not.toContain(schoolUrl('Zzz Fourth'));
    expect(counts(s.tables)).toBe(0);
    expect(runRows(s.tables)[0]!.error).toBeTruthy();
    expect(runRows(s.tables)[0]!.stats.completedStamp).toBeUndefined();
  });

  it('a 404 skips that school and marks the run PARTIAL without counting toward the halt', async () => {
    const s = setup([
      {
        id: 'sch_d',
        key: 'Zzz Fourth',
        fixture: 'yale.html',
      },
    ]);
    s.routes[schoolUrl('Alabama COM')] = null;
    const { host, requested } = createFakeHost(s.routes);
    const r = await runCycletrack(
      {
        prisma: s.prisma,
        host,
        shouldStop: () => false,
        log,
      },
      {
        trigger: 'CRON',
      },
    );
    expect(r.status).toBe('PARTIAL');
    expect(requested).toContain(schoolUrl('Zzz Fourth'));
    expect(counts(s.tables)).toBeGreaterThan(0);
  });

  it('FAILED when the first request fails and nothing is ingested', async () => {
    const s = setup();
    const r = await runCycletrack(
      {
        prisma: s.prisma,
        host: createFakeHost(() => null).host,
        shouldStop: () => false,
        log,
      },
      {
        trigger: 'CRON',
      },
    );
    expect(r.status).toBe('FAILED');
    expect(counts(s.tables)).toBe(0);
  });

  it('a failing /explorer/first does not abort the walk', async () => {
    const s = setup();
    s.routes['/explorer/first'] = CHALLENGE;
    const r = await runCycletrack(
      {
        prisma: s.prisma,
        host: createFakeHost(s.routes).host,
        shouldStop: () => false,
        log,
      },
      {
        trigger: 'CRON',
      },
    );
    expect(r.status).toBe('OK');
    expect(counts(s.tables)).toBeGreaterThan(0);
    expect(typeof runRows(s.tables)[0]!.stats.firstDatesError).toBe('string');
    expect(s.tables.medSchoolStats).toHaveLength(0);
  });

  it('a permanently 404 school with an otherwise full walk stores completedStamp, so the next unchanged run makes one request', async () => {
    const s = setup([
      {
        id: 'sch_d',
        key: 'Zzz Fourth',
        fixture: 'yale.html',
      },
    ]);
    s.routes[schoolUrl('Zzz Fourth')] = null;
    const deps = (host: ReturnType<typeof createFakeHost>['host']) => ({
      prisma: s.prisma,
      host,
      shouldStop: () => false,
      log,
    });
    const r1 = await runCycletrack(deps(createFakeHost(s.routes).host), {
      trigger: 'CRON',
    });
    expect(r1.status).toBe('PARTIAL');
    const run1 = runRows(s.tables)[0]!;
    expect(typeof run1.stats.completedStamp).toBe('string');
    expect(run1.stats.skipped).toEqual(['Zzz Fourth']);
    const second = createFakeHost(s.routes);
    const r2 = await runCycletrack(deps(second.host), {
      trigger: 'CRON',
    });
    expect(r2.skippedUnchanged).toBe(true);
    expect(second.requested).toHaveLength(1);
  });

  it('a halted run does not store completedStamp even with 404 skips', async () => {
    const s = setup([
      {
        id: 'sch_d',
        key: 'Zzz Fourth',
        fixture: 'yale.html',
      },
    ]);
    s.routes[schoolUrl('Alabama COM')] = CHALLENGE;
    s.routes[schoolUrl('Yale')] = CHALLENGE;
    s.routes[schoolUrl('Zzz Fourth')] = null;
    const r = await runCycletrack(
      {
        prisma: s.prisma,
        host: createFakeHost(s.routes).host,
        shouldStop: () => false,
        log,
      },
      {
        trigger: 'CRON',
      },
    );
    expect(r.status).toBe('PARTIAL');
    expect(runRows(s.tables)[0]!.stats.completedStamp).toBeUndefined();
  });

  it('returns a FAILED summary instead of throwing when the run row cannot be created', async () => {
    const s = setup();
    s.prisma.medSourceRun.create = async () => {
      throw new Error('db down');
    };
    const { host, requested } = createFakeHost(s.routes);
    const r = await runCycletrack(
      {
        prisma: s.prisma,
        host,
        shouldStop: () => false,
        log,
      },
      {
        trigger: 'CRON',
      },
    );
    expect(r.status).toBe('FAILED');
    expect(requested).toHaveLength(0);
  });
  const deps = (s: ReturnType<typeof setup>, host: ReturnType<typeof createFakeHost>['host']) => ({
    prisma: s.prisma,
    host,
    shouldStop: () => false,
    log,
  });

  it('a 404 on the first school still stores the stamp, and the next same-stamp run short-circuits (R17)', async () => {
    const s = setup();
    const first = [...s.all].sort((a, b) => (a.key < b.key ? -1 : 1))[0]!;
    s.routes[schoolUrl(first.key)] = null;
    const h1 = createFakeHost(s.routes);
    const r1 = await runCycletrack(deps(s, h1.host), {
      trigger: 'CRON',
    });
    expect(r1.status).toBe('PARTIAL');
    expect(typeof runRows(s.tables)[0]!.stats.completedStamp).toBe('string');
    const h2 = createFakeHost(s.routes);
    const r2 = await runCycletrack(deps(s, h2.host), {
      trigger: 'CRON',
    });
    expect(r2.skippedUnchanged).toBe(true);
    // The 404 first school, then the next target that parses: a bounded probe, not a full walk.
    expect(h2.requested).toEqual([schoolUrl(first.key), schoolUrl(s.all.map((a) => a.key).sort()[1]!)]);
  });

  it('gives up probing for a stamp after a few targets and falls back to the full walk', async () => {
    const s = setup([
      {
        id: 'sch_d',
        key: 'Zzz Four',
        fixture: 'yale.html',
      },
      {
        id: 'sch_e',
        key: 'Zzz Five',
        fixture: 'yale.html',
      },
    ]);
    const sorted = s.all.map((a) => a.key).sort();
    for (const key of sorted.slice(0, 4)) s.routes[schoolUrl(key)] = null;
    const h = createFakeHost(s.routes);
    const r = await runCycletrack(deps(s, h.host), {
      trigger: 'CRON',
    });
    expect(r.status).toBe('PARTIAL');
    expect(h.requested.filter((p) => p !== '/explorer/first')).toHaveLength(5);
    expect(runRows(s.tables)[0]!.stats.completedStamp).toBeUndefined();
  });

  it('a full walk where no page yields a table is PARTIAL, says so, and stores no stamp', async () => {
    const s = setup();
    for (const a of s.all) {
      const key = schoolUrl(a.key);
      s.routes[key] = s.routes[key]!.replace(/daily milestone observations/gi, 'daily milestone figures');
    }
    const r = await runCycletrack(deps(s, createFakeHost(s.routes).host), {
      trigger: 'CRON',
    });
    expect(r.status).toBe('PARTIAL');
    const row = runRows(s.tables)[0]!;
    expect(row.error).toBe('no tables parsed');
    expect(row.stats.zeroTablePages).toBe(3);
    expect(row.stats.completedStamp).toBeUndefined();
    expect(counts(s.tables)).toBe(0);
  });

  it('closes a stale RUNNING hourly row as interrupted at the start of a run', async () => {
    const s = setup();
    s.tables.medSourceRun!.push({
      id: 'old',
      source: 'CYCLETRACK',
      job: 'cycletrack',
      status: 'RUNNING',
      stats: null,
      error: null,
    });
    s.tables.medSourceRun!.push({
      id: 'other',
      source: 'CYCLETRACK',
      job: 'backfill',
      status: 'RUNNING',
      stats: null,
      error: null,
    });
    await runCycletrack(deps(s, createFakeHost(s.routes).host), {
      trigger: 'CRON',
    });
    const rows = s.tables.medSourceRun as Array<{
      id: string;
      status: string;
      error: string | null;
    }>;
    const old = rows.find((r) => r.id === 'old')!;
    expect(old.status).toBe('FAILED');
    expect(old.error).toBe('interrupted');
    expect(rows.find((r) => r.id === 'other')!.status).toBe('RUNNING');
  });

  it('two CYCLETRACK aliases on one school: only the first is fetched and stats.duplicateAliases = [second]', async () => {
    const s = setup();
    s.tables.medSchoolAlias!.push({
      id: 'al_dup',
      schoolId: 'sch_c',
      source: 'CYCLETRACK',
      sourceKey: 'Yale Copy',
    });
    const { host, requested } = createFakeHost(s.routes);
    const r = await runCycletrack(
      {
        prisma: s.prisma,
        host,
        shouldStop: () => false,
        log,
      },
      {
        trigger: 'MANUAL',
      },
    );
    expect(r.schools).toBe(3);
    expect(requested).not.toContain(schoolUrl('Yale Copy'));
    const run = runRows(s.tables)[0]!;
    expect(run.stats.duplicateAliases).toEqual(['Yale Copy']);
  });
});
