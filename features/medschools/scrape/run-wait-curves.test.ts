import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { addDays } from '../engine/stats/days';
import { buildWaitCurves, loadObservationRows, runWaitCurves, type TrackerObservationRow } from './run-wait-curves';
import { createFakePrisma } from './test-support';

const ASOF = '2026-11-23';
const row = (i: number, over: Partial<TrackerObservationRow> = {}): TrackerObservationRow => ({
  schoolId: 's1',
  program: 'REG',
  member: `member-secret-${i}`,
  completeOn: '2026-09-01',
  inviteOn: i % 2 === 0 ? addDays('2026-09-01', 10 + i) : null,
  endOn: null,
  ...over,
});
const members = (n: number, over: Partial<TrackerObservationRow> = {}) =>
  Array.from({ length: n }, (_, i) => row(i, over));

describe('buildWaitCurves: the floor is on distinct members', () => {
  it('19 members: no curve; 20: one; 21: one with members 21', () => {
    expect(buildWaitCurves(members(19), ASOF)).toEqual([]);
    expect(buildWaitCurves(members(20), ASOF)).toHaveLength(1);
    expect(buildWaitCurves(members(21), ASOF)[0]).toMatchObject({ members: 21, schoolId: 's1', program: 'REG' });
  });
  it('one member with two cycles counts once toward the floor, and both feed the curve once it exists', () => {
    const repeat = row(0, { completeOn: '2025-09-01', inviteOn: '2025-09-20' });
    expect(buildWaitCurves([...members(19), repeat], ASOF)).toEqual([]);
    const c = buildWaitCurves([...members(20), repeat], ASOF)[0];
    expect(c?.members).toBe(20);
    // 20 members plus the repeat observation: the invited count includes the second cycle's invite.
    const base = buildWaitCurves(members(20), ASOF)[0];
    expect(c?.invited).toBe((base?.invited ?? 0) + 1);
  });
  it('observations dropped by observationOf do not count toward the floor', () => {
    const bad = Array.from({ length: 5 }, (_, i) => row(100 + i, { inviteOn: '2026-08-01' })); // invite before complete
    expect(buildWaitCurves([...members(19), ...bad], ASOF)).toEqual([]);
    const future = Array.from({ length: 5 }, (_, i) => row(200 + i, { completeOn: '2026-12-01', inviteOn: null }));
    expect(buildWaitCurves([...members(19), ...future], ASOF)).toEqual([]);
  });
  it('keeps school x program pairs apart', () => {
    const rows = [...members(20), ...members(20, { program: 'PHD' }), ...members(10, { schoolId: 's2' })];
    expect(buildWaitCurves(rows, ASOF).map((c) => `${c.schoolId}|${c.program}`)).toEqual(['s1|PHD', 's1|REG']);
  });
});

describe('the SQL', () => {
  it('reads sharing cycles and COMPLETE milestones only', async () => {
    const q = vi.fn(async (..._a: unknown[]) => []);
    await loadObservationRows({ $queryRaw: q as never });
    const sql = (q.mock.calls[0]![0] as string[]).join('?');
    expect(sql).toContain('"shareAnonymously" = true');
    expect(sql).toContain("'COMPLETE'");
    expect(sql).toContain('"med_tracker_milestone"');
  });
});

describe('runWaitCurves', () => {
  const setup = (rows: () => TrackerObservationRow[]) => {
    const f = createFakePrisma();
    const lines: string[] = [];
    const log = {
      info: (l: string) => lines.push(l),
      warn: (l: string) => lines.push(l),
      error: (l: string) => lines.push(l),
    };
    const db = { $queryRaw: vi.fn(async () => rows()) };
    const run = () => runWaitCurves({ prisma: f.prisma, db: db as never, asOf: ASOF, log });
    return { f, db, run, lines };
  };
  const stored = (f: ReturnType<typeof createFakePrisma>) => f.tables.medWaitCurve as Record<string, unknown>[];

  it('stores only aggregates: the write has exactly the pinned key sets', async () => {
    const s = setup(() => members(21));
    expect(await s.run()).toEqual({ curves: 1, removed: 0 });
    const w = s.f.writes[0] as { create: Record<string, unknown>; update: Record<string, unknown> };
    expect(Object.keys(w.create).sort()).toEqual([
      'asOf',
      'curve',
      'invited',
      'maxDay',
      'members',
      'program',
      'schoolId',
    ]);
    expect(Object.keys(w.update).sort()).toEqual(['asOf', 'computedAt', 'curve', 'invited', 'maxDay', 'members']);
    const row = stored(s.f)[0] as { members: number; curve: Record<string, unknown> };
    expect(row.members).toBe(21);
    expect(Object.keys(row.curve).sort()).toEqual(['s', 't']);
    expect(JSON.stringify(s.f.writes)).not.toContain('member-secret');
  });

  it('a member switching sharing off drops 20 to 19 and the next run deletes the row; a pair that never reached 20 has nothing to delete', async () => {
    let n = 20;
    const s = setup(() => [...members(n), ...members(5, { schoolId: 's2' })]);
    expect(await s.run()).toEqual({ curves: 1, removed: 0 });
    expect(stored(s.f)).toHaveLength(1);
    n = 19;
    expect(await s.run()).toEqual({ curves: 0, removed: 1 });
    expect(stored(s.f)).toHaveLength(0);
  });

  it('a failing query is reported with a fixed message: no member or date reaches the log or the error', async () => {
    const s = setup(() => []);
    s.db.$queryRaw.mockRejectedValue(new Error('bind failed for member-secret-3 on 2026-09-01'));
    await expect(s.run()).rejects.toThrow('wait-curve query failed');
    await s.run().catch((e: Error) => expect(e.message).not.toContain('member-secret'));
  });

  it('no log line carries a member or a date', async () => {
    const s = setup(() => members(25));
    await s.run();
    expect(s.lines.length).toBeGreaterThan(0);
    for (const l of s.lines) expect(l).not.toMatch(/member-secret|2026-09/);
  });
});

describe('what the module may do', () => {
  it('never logs, stores or throws a member', () => {
    const src = readFileSync('features/medschools/scrape/run-wait-curves.ts', 'utf8');
    expect(src).not.toMatch(/log\.\w+\([^)]*member/);
    expect(src).not.toMatch(/lib\/ai|fetch\(/);
  });
});
