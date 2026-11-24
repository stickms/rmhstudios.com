import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { addDays } from '../engine/stats/days';
import { triangleCycle } from '../engine/stats/fixtures';
import { FORECAST_CRON, FORECAST_MIN_INTERVAL_MS, fitSchool, runForecast } from './run-forecast';
import { createFakePrisma } from './test-support';

const log = { info: () => undefined, warn: () => undefined, error: () => undefined };
const NOW = new Date('2027-01-15T06:40:00.000Z'); // asOf 2027-01-14, day 227 of the 2027 cycle
const shape = { startDay: 30, peakDay: 150, endDay: 330 };
type Table = Record<string, unknown>[];

function setup(rows: () => unknown[] = () => []) {
  const f = createFakePrisma();
  const queryRaw = vi.fn(async () => rows());
  let t = NOW;
  const run = (trigger: 'CRON' | 'MANUAL' = 'MANUAL', over: { shouldStop?: () => boolean } = {}) =>
    runForecast({ prisma: f.prisma, db: { $queryRaw: queryRaw } as never, now: () => t, log, ...over }, { trigger });
  const school = (id: string, active = true) => (f.tables.medSchool as Table).push({ id, active });
  /** A season of one source: a triangle of `total` reports, cut at `until` (a date) when given. */
  const season = (o: {
    schoolId: string;
    cycleYear: number;
    total: number;
    source?: string;
    program?: string;
    eventType?: string;
    until?: string;
    extra?: Record<string, unknown>;
  }) => {
    const zero = `${o.cycleYear - 1}-06-01`;
    for (const d of triangleCycle({ total: o.total, ...shape })) {
      const date = addDays(zero, d.day);
      if (o.until && date > o.until) continue;
      (f.tables.medCycleCount as Table).push({
        schoolId: o.schoolId,
        program: o.program ?? 'REG',
        cycleYear: o.cycleYear,
        date: new Date(`${date}T00:00:00.000Z`),
        eventType: o.eventType ?? 'INTERVIEW',
        source: o.source ?? 'CYCLETRACK',
        count: d.count,
        contributors: null,
        ...o.extra,
      });
    }
  };
  return { f, run, school, season, queryRaw, at: (d: Date) => (t = d) };
}
const forecasts = (f: ReturnType<typeof setup>['f']) => f.tables.medForecast as Record<string, unknown>[];

describe('the schedule', () => {
  it('is 06:40 UTC daily with a persisted minimum interval under a day', () => {
    expect(FORECAST_CRON).toBe('40 6 * * *');
    expect(FORECAST_MIN_INTERVAL_MS).toBeLessThan(24 * 3_600_000);
  });
});

describe('runForecast', () => {
  it('writes one FULL row for the program and type that has a primary series, and none for the rest', async () => {
    const s = setup();
    s.school('a');
    s.season({ schoolId: 'a', cycleYear: 2027, total: 150, until: '2027-01-14' });
    s.season({ schoolId: 'a', cycleYear: 2026, total: 200 });
    s.season({ schoolId: 'a', cycleYear: 2025, total: 100 });
    const r = await s.run();
    expect(r).toMatchObject({
      status: 'OK',
      outcome: 'ran',
      cycleYear: 2027,
      schools: 1,
      fitted: 1,
      early: 0,
      none: 0,
    });
    const rows = forecasts(s.f);
    expect(rows).toHaveLength(1);
    const row = rows[0] as {
      program: string;
      eventType: string;
      mode: string;
      source: string;
      asOf: Date;
      curve: Record<string, number[]>;
    };
    expect(row).toMatchObject({ program: 'REG', eventType: 'INTERVIEW', mode: 'FULL', source: 'CYCLETRACK' });
    expect(row.asOf.toISOString().slice(0, 10)).toBe('2027-01-14');
    expect(row.curve.days?.[0]).toBe(227);
    // Interviews belong to the cycle until June 30 (`cycleYearOf`): day zero is 2026-06-01, so the band ends on day 394.
    expect(row.curve.days?.[row.curve.days.length - 1]).toBe(394);
    const lens = ['p10', 'p50', 'p90'].map((k) => row.curve[k]?.length);
    expect(lens).toEqual([row.curve.days?.length, row.curve.days?.length, row.curve.days?.length]);
  });

  it('an RMH-only school whose figures are suppressed, unpublished or from today gets no row, and live figures change nothing', async () => {
    const s = setup();
    s.school('r');
    const cell = (date: string, extra: Record<string, unknown>) =>
      (s.f.tables.medCycleCount as Table).push({
        schoolId: 'r',
        program: 'REG',
        cycleYear: 2027,
        date: new Date(`${date}T00:00:00.000Z`),
        eventType: 'INTERVIEW',
        source: 'RMH',
        count: 9,
        contributors: 9,
        ...extra,
      });
    cell('2027-01-10', { publishedCount: 2, publishedContributors: 2 });
    cell('2027-01-11', { publishedCount: null, publishedContributors: null });
    cell('2027-01-15', { publishedCount: 6, publishedContributors: 6 });
    const first = await s.run();
    expect(first).toMatchObject({ fitted: 0, early: 0, none: 0, unchanged: 0 });
    expect(forecasts(s.f)).toHaveLength(0);
    // Live contributors rise without a published value: still nothing.
    for (const r of s.f.tables.medCycleCount as Table) r.contributors = 50;
    expect(await s.run()).toMatchObject({ fitted: 0, early: 0, none: 0, unchanged: 0 });
    expect(forecasts(s.f)).toHaveLength(0);
  });

  it('is idempotent on the same day and recomputes on the next', async () => {
    const s = setup();
    s.school('a');
    s.season({ schoolId: 'a', cycleYear: 2027, total: 150, until: '2027-01-14' });
    s.season({ schoolId: 'a', cycleYear: 2026, total: 200 });
    const first = await s.run();
    const written = first!.fitted + first!.early + first!.none;
    expect(written).toBe(1);
    const second = await s.run();
    expect(second).toMatchObject({ fitted: 0, early: 0, none: 0, unchanged: written });
    s.season({ schoolId: 'a', cycleYear: 2027, total: 1, until: '2027-01-15', eventType: 'SECONDARY' });
    s.at(new Date('2027-01-16T06:40:00.000Z'));
    const third = await s.run();
    expect(third!.unchanged).toBe(0);
    expect((forecasts(s.f)[0] as { asOf: Date }).asOf.toISOString().slice(0, 10)).toBe('2027-01-15');
  });

  it('skips a cron run inside the interval without reading counts; manual bypasses it; a ledger error fails closed', async () => {
    const s = setup();
    s.school('a');
    await s.run('CRON');
    const reads = vi.spyOn(s.f.prisma.medCycleCount, 'findMany');
    s.at(new Date(NOW.getTime() + 3_600_000));
    expect(await s.run('CRON')).toMatchObject({ status: 'OK', outcome: 'skipped-min-interval' });
    expect(reads).not.toHaveBeenCalled();
    expect(await s.run('MANUAL')).toMatchObject({ outcome: 'ran' });
    const g = setup();
    vi.spyOn(g.f.prisma.medSourceRun, 'findMany').mockRejectedValue(new Error('db down'));
    expect(await g.run('CRON')).toMatchObject({ outcome: 'skipped-min-interval' });
  });

  it('a history cycle under 10 events is not in the basis; no usable history writes a NONE row with an empty curve', async () => {
    const s = setup();
    s.school('a');
    s.school('b');
    s.season({ schoolId: 'a', cycleYear: 2027, total: 150, until: '2027-01-14' });
    s.season({ schoolId: 'a', cycleYear: 2026, total: 9 });
    s.season({ schoolId: 'a', cycleYear: 2025, total: 100 });
    s.season({ schoolId: 'b', cycleYear: 2027, total: 150, until: '2027-01-14' });
    await s.run();
    const a = forecasts(s.f).find((r) => r.schoolId === 'a') as { summary: { basis: { cycleYear: number }[] } };
    expect(a.summary.basis.map((b) => b.cycleYear)).toEqual([2025]);
    const b = forecasts(s.f).find((r) => r.schoolId === 'b') as { mode: string; curve: { days: number[] } };
    expect(b.mode).toBe('NONE');
    expect(b.curve.days).toEqual([]);
  });

  it('a decision category is drawn to August 31, not May 31: the path, the total and halfDay cover the whole season', async () => {
    const s = setup();
    s.school('a');
    s.at(new Date('2027-02-20T06:40:00.000Z'));
    const type = { eventType: 'ACCEPTANCE' };
    // Past seasons report acceptances all the way to the end of August (day 456 from 2026-06-01).
    s.season({ schoolId: 'a', cycleYear: 2027, total: 150, until: '2027-02-19', ...type });
    s.season({ schoolId: 'a', cycleYear: 2026, total: 200, ...type });
    s.season({ schoolId: 'a', cycleYear: 2025, total: 100, ...type });
    await s.run();
    const row = forecasts(s.f).find((r) => r.eventType === 'ACCEPTANCE') as { curve: { days: number[] } };
    expect(row.curve.days[row.curve.days.length - 1]).toBe(456);
  });

  it('after a category ends nothing is written for it, and the last rows stand', async () => {
    const s = setup();
    s.school('a');
    s.at(new Date('2027-05-20T06:40:00.000Z'));
    s.season({ schoolId: 'a', cycleYear: 2027, total: 150, until: '2027-05-19' });
    s.season({ schoolId: 'a', cycleYear: 2026, total: 200 });
    await s.run();
    const before = JSON.stringify(forecasts(s.f));
    expect(before).not.toBe('[]');
    // The interview season ended June 30 (July 1 is the next cycle's); only decision categories are still open.
    s.at(new Date('2027-07-02T06:40:00.000Z'));
    expect(await s.run()).toMatchObject({ cycleYear: 2027, fitted: 0, early: 0, none: 0, unchanged: 0 });
    expect(JSON.stringify(forecasts(s.f))).toBe(before);
    expect(forecasts(s.f).some((r) => r.cycleYear === 2028)).toBe(false);
  });

  it('stops between schools and ends PARTIAL, leaving the rest untouched', async () => {
    const s = setup();
    for (const id of ['a', 'b']) {
      s.school(id);
      s.season({ schoolId: id, cycleYear: 2027, total: 150, until: '2027-01-14' });
      s.season({ schoolId: id, cycleYear: 2026, total: 200 });
    }
    let calls = 0;
    const r = await s.run('MANUAL', { shouldStop: () => calls++ >= 1 });
    expect(r).toMatchObject({ status: 'PARTIAL', schools: 1 });
    expect(forecasts(s.f).map((x) => x.schoolId)).toEqual(['a']);
  });

  it("builds the wait curves with the run's own asOf, after the forecasts", async () => {
    const member = (i: number) => ({
      schoolId: 'a',
      program: 'REG',
      member: `m${i}`,
      completeOn: '2026-11-01',
      inviteOn: i % 2 ? '2026-11-10' : null,
      endOn: null,
    });
    const s = setup(() => Array.from({ length: 26 }, (_, i) => member(i)));
    s.school('a');
    s.season({ schoolId: 'a', cycleYear: 2027, total: 150, until: '2027-01-14' });
    s.season({ schoolId: 'a', cycleYear: 2026, total: 200 });
    const r = await s.run();
    expect(r).toMatchObject({ status: 'OK', fitted: 1, curves: 1, curvesRemoved: 0 });
    const w = (s.f.tables.medWaitCurve as { asOf: Date; members: number }[])[0];
    expect(w?.asOf.toISOString().slice(0, 10)).toBe('2027-01-14');
    expect(w?.members).toBe(26); // created at 23 members and 13 invites (hysteresis)
  });

  it('a failing wait-curve step makes the run PARTIAL and keeps the forecasts', async () => {
    const s = setup();
    s.queryRaw.mockRejectedValue(new Error('boom member-x'));
    s.school('a');
    s.season({ schoolId: 'a', cycleYear: 2027, total: 150, until: '2027-01-14' });
    s.season({ schoolId: 'a', cycleYear: 2026, total: 200 });
    const r = await s.run();
    expect(r).toMatchObject({ status: 'PARTIAL', fitted: 1, curves: 0 });
    expect(forecasts(s.f)).toHaveLength(1);
    const ledger = (s.f.tables.medSourceRun as { error: string }[])[0];
    expect(ledger?.error).toBe('wait curves: wait-curve query failed');
  });

  it('inactive schools are not forecast', async () => {
    const s = setup();
    s.school('x', false);
    s.season({ schoolId: 'x', cycleYear: 2027, total: 150, until: '2027-01-14' });
    await s.run();
    expect(forecasts(s.f)).toHaveLength(0);
  });
});

describe('fitSchool', () => {
  it('fits each program and type on its own and never mixes sources', () => {
    const zero = (y: number) => `${y - 1}-06-01`;
    const rows = [
      ...['CYCLETRACK', 'ADMIT'].flatMap((source) =>
        triangleCycle({ total: 120, ...shape })
          .filter((d) => d.day <= 227)
          .map((d) => ({
            program: 'REG' as const,
            cycleYear: 2027,
            eventType: 'INTERVIEW' as const,
            source: source as 'ADMIT',
            date: addDays(zero(2027), d.day),
            count: d.count,
            contributors: null,
          })),
      ),
      ...triangleCycle({ total: 150, ...shape }).map((d) => ({
        program: 'REG' as const,
        cycleYear: 2026,
        eventType: 'INTERVIEW' as const,
        source: 'ADMIT' as const,
        date: addDays(zero(2026), d.day),
        count: d.count,
        contributors: null,
      })),
    ];
    const out = fitSchool({ schoolId: 's', rows, cycleYear: 2027, today: '2027-01-15', dayZeroOf: zero });
    expect(out).toHaveLength(1);
    // CycleTrack is primary; its history is CycleTrack's (there is none), so Admit's 2026 is never borrowed.
    expect(out[0]).toMatchObject({ source: 'CYCLETRACK', mode: 'NONE' });
  });
});

describe('what the job may touch', () => {
  const src = readFileSync('features/medschools/scrape/run-forecast.ts', 'utf8');
  it('reads counts only through the shared floor', () => {
    expect(src).toContain("from '../engine/floor'");
    expect(src.match(/floorWhere\(at\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(src).not.toContain('medCycleEvent');
    expect(src).not.toContain('.count)');
  });
  it('makes no network or model call', () => {
    expect(src).not.toMatch(/lib\/ai|fetch\(|createPoliteHost|callModel/);
  });
});
