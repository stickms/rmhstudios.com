import { describe, expect, it } from 'vitest';
import { rollupEventCounts } from './rollup-events';
import { createFakePrisma } from './test-support';

type Ev = {
  program: 'REG' | 'PHD' | null;
  type?: string;
  at: string;
  school?: string;
  source?: string;
  year?: number;
};
let n = 0;
function setup(events: Ev[]) {
  const fake = createFakePrisma();
  for (const e of events)
    fake.tables.medCycleEvent!.push({
      id: `e${++n}`,
      schoolId: e.school ?? 's1',
      cycleYear: e.year ?? 2027,
      program: e.program,
      eventType: e.type ?? 'ACCEPTANCE',
      occurredAt: new Date(e.at),
      source: e.source ?? 'ADMIT',
      dedupeHash: `h${n}`,
      inState: null,
    });
  return fake;
}
const cell = (program: 'REG' | 'PHD', date: string, schoolId = 's1') => ({
  schoolId,
  program,
  cycleYear: 2027,
  date,
});
const rows = (f: ReturnType<typeof createFakePrisma>) => f.tables.medCycleCount! as Array<Record<string, unknown>>;

describe('rollupEventCounts', () => {
  it('counts events per UTC day and type', async () => {
    const f = setup([
      {
        program: 'REG',
        at: '2026-11-18T00:00:00.000Z',
      },
      {
        program: 'REG',
        at: '2026-11-18T23:59:59.000Z',
      },
      {
        program: 'REG',
        at: '2026-11-19T00:00:00.000Z',
      },
      {
        program: 'REG',
        at: '2026-11-18T10:00:00.000Z',
        type: 'INTERVIEW',
      },
    ]);
    const n = await rollupEventCounts(f.prisma, {
      source: 'ADMIT',
      touched: [cell('REG', '2026-11-18'), cell('REG', '2026-11-19')],
    });
    expect(n).toBe(3);
    const got = rows(f)
      .map((r) => `${(r.date as Date).toISOString().slice(0, 10)} ${r.eventType} ${r.count}`)
      .sort();
    expect(got).toEqual(['2026-11-18 ACCEPTANCE 2', '2026-11-18 INTERVIEW 1', '2026-11-19 ACCEPTANCE 1']);
    expect(rows(f).every((r) => r.contributors === null && r.source === 'ADMIT')).toBe(true);
  });

  it('program-null events are never counted', async () => {
    const f = setup([
      {
        program: null,
        at: '2026-11-18T10:00:00.000Z',
      },
      {
        program: 'PHD',
        at: '2026-11-18T10:00:00.000Z',
      },
    ]);
    await rollupEventCounts(f.prisma, {
      source: 'ADMIT',
      touched: [cell('PHD', '2026-11-18')],
    });
    expect(rows(f)).toHaveLength(1);
    expect(rows(f)[0]).toMatchObject({
      program: 'PHD',
      count: 1,
    });
  });

  it('MD and MD-PhD never mix', async () => {
    const f = setup([
      {
        program: 'REG',
        at: '2026-11-18T10:00:00.000Z',
      },
      {
        program: 'PHD',
        at: '2026-11-18T11:00:00.000Z',
      },
    ]);
    await rollupEventCounts(f.prisma, {
      source: 'ADMIT',
      touched: [cell('REG', '2026-11-18'), cell('PHD', '2026-11-18')],
    });
    expect(
      rows(f)
        .map((r) => `${r.program}${r.count}`)
        .sort(),
    ).toEqual(['PHD1', 'REG1']);
  });

  it('re-running writes nothing', async () => {
    const f = setup([
      {
        program: 'REG',
        at: '2026-11-18T10:00:00.000Z',
      },
    ]);
    const args = {
      source: 'ADMIT' as const,
      touched: [cell('REG', '2026-11-18')],
    };
    await rollupEventCounts(f.prisma, args);
    const w = f.writes.length;
    expect(await rollupEventCounts(f.prisma, args)).toBe(0);
    expect(f.writes.length).toBe(w);
  });

  it("a new event updates the day's count instead of adding a row", async () => {
    const f = setup([
      {
        program: 'REG',
        at: '2026-11-18T10:00:00.000Z',
      },
    ]);
    const args = {
      source: 'ADMIT' as const,
      touched: [cell('REG', '2026-11-18')],
    };
    await rollupEventCounts(f.prisma, args);
    f.tables.medCycleEvent!.push({
      id: 'x',
      schoolId: 's1',
      cycleYear: 2027,
      program: 'REG',
      eventType: 'ACCEPTANCE',
      occurredAt: new Date('2026-11-18T12:00:00.000Z'),
      source: 'ADMIT',
      dedupeHash: 'hx',
      inState: null,
    });
    expect(await rollupEventCounts(f.prisma, args)).toBe(1);
    expect(rows(f)).toHaveLength(1);
    expect(rows(f)[0]!.count).toBe(2);
    expect(f.writes.some((w) => 'where' in (w as object) && !('create' in (w as object)))).toBe(true);
  });

  it('ADMIT rows never touch CYCLETRACK rows for the same cell', async () => {
    const f = setup([
      {
        program: 'REG',
        at: '2026-11-18T10:00:00.000Z',
      },
      {
        program: 'REG',
        at: '2026-11-18T10:00:00.000Z',
        source: 'CYCLETRACK',
      },
    ]);
    f.tables.medCycleCount!.push({
      id: 'ct',
      schoolId: 's1',
      program: 'REG',
      cycleYear: 2027,
      date: new Date('2026-11-18T00:00:00.000Z'),
      eventType: 'ACCEPTANCE',
      source: 'CYCLETRACK',
      count: 40,
      contributors: null,
    });
    await rollupEventCounts(f.prisma, {
      source: 'ADMIT',
      touched: [cell('REG', '2026-11-18')],
    });
    const ct = rows(f).find((r) => r.source === 'CYCLETRACK')!;
    expect(ct.count).toBe(40);
    expect(rows(f).find((r) => r.source === 'ADMIT')!.count).toBe(1);
  });

  it('only recounts touched cells', async () => {
    const f = setup([
      {
        program: 'REG',
        at: '2026-11-18T10:00:00.000Z',
      },
      {
        program: 'REG',
        at: '2026-11-19T10:00:00.000Z',
      },
    ]);
    await rollupEventCounts(f.prisma, {
      source: 'ADMIT',
      touched: [cell('REG', '2026-11-18')],
    });
    expect(rows(f)).toHaveLength(1);
  });
});
