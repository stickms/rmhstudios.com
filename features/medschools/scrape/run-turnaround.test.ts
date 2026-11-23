import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { TURNAROUND_MAX_DAYS, TURNAROUND_MIN_MEMBERS } from '../engine/stats/constants';
import { addDays } from '../engine/stats/days';
import { buildTurnarounds, runTurnaround, worthRefreshing, type TurnaroundRow } from './run-turnaround';
import { createFakePrisma } from './test-support';

const log = { info: () => undefined, warn: () => undefined, error: () => undefined };
const BASE = '2026-07-01';
const row = (member: string, days: number, over: Partial<TurnaroundRow> = {}): TurnaroundRow => ({
  schoolId: 's1',
  program: 'REG',
  member,
  receivedOn: BASE,
  submittedOn: addDays(BASE, days),
  ...over,
});
/** n distinct members, member i takes `days(i)` days. */
const members = (n: number, days: (i: number) => number = (i) => i + 1, over: Partial<TurnaroundRow> = {}) =>
  Array.from({ length: n }, (_, i) => row(`m${i}`, days(i), over));

describe('buildTurnarounds', () => {
  it('has no figure under 20 distinct members and one at exactly 20', () => {
    expect(TURNAROUND_MIN_MEMBERS).toBe(20);
    expect(buildTurnarounds(members(19))).toEqual([]);
    expect(buildTurnarounds(members(20))).toHaveLength(1);
  });

  it('counts a member once however many applications or cycles they contribute', () => {
    const many = [...members(19), row('m0', 3), row('m0', 4), row('m0', 5)];
    expect(buildTurnarounds(many)).toEqual([]);
    const twenty = [...members(20), row('m0', 3)];
    expect(buildTurnarounds(twenty)[0]?.members).toBe(20);
  });

  it('computes whole-day nearest-rank quantiles over one value per member', () => {
    // days 1..20: p25 = 5th, median = 10th, p75 = 15th
    expect(buildTurnarounds(members(20))[0]).toMatchObject({
      schoolId: 's1',
      program: 'REG',
      members: 20,
      p25Days: 5,
      medianDays: 10,
      p75Days: 15,
    });
  });

  it('drops a negative or over-long pair before the floor, not after', () => {
    const rows = [
      ...members(19),
      row('bad1', -2),
      row('bad2', TURNAROUND_MAX_DAYS + 1),
      row('bad3', 0, { submittedOn: 'not a date' }),
    ];
    expect(buildTurnarounds(rows)).toEqual([]);
    expect(buildTurnarounds([...rows, row('ok', 7)])).toHaveLength(1);
  });

  it('keeps schools and programs apart', () => {
    const rows = [
      ...members(20),
      ...members(20, (i) => i + 2, { program: 'PHD' }),
      ...members(5, (i) => i, { schoolId: 's2' }),
    ];
    expect(buildTurnarounds(rows).map((r) => [r.schoolId, r.program, r.medianDays])).toEqual([
      ['s1', 'PHD', 11],
      ['s1', 'REG', 10],
    ]);
  });
});

describe('worthRefreshing', () => {
  it('replaces a stored figure only when the member count moved by 3 or more', () => {
    expect(worthRefreshing({ members: 20 }, { members: 22 })).toBe(false);
    expect(worthRefreshing({ members: 20 }, { members: 23 })).toBe(true);
    expect(worthRefreshing({ members: 25 }, { members: 22 })).toBe(true);
  });
});

describe('runTurnaround', () => {
  const setup = (rows: () => unknown[]) => {
    const f = createFakePrisma();
    const db = { $queryRaw: vi.fn(async () => rows()) } as never;
    const run = () => runTurnaround({ prisma: f.prisma, db, asOf: '2026-11-22', log });
    return { f, run, db };
  };
  const stored = (f: ReturnType<typeof createFakePrisma>) =>
    f.tables.medSecondaryTurnaround as Record<string, unknown>[];

  it('stores counts and whole-day quantiles only: no member, date or application survives', async () => {
    const s = setup(() => members(22));
    expect(await s.run()).toEqual({ figures: 1, removed: 0, kept: 0 });
    const rows = stored(s.f);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual(
      ['asOf', 'id', 'medianDays', 'members', 'p25Days', 'p75Days', 'program', 'schoolId'].sort(),
    );
    const blob = JSON.stringify(s.f.writes);
    expect(blob).not.toMatch(/"m\d+"|2026-07|receivedOn|submittedOn|userId/);
    expect((rows[0]!.asOf as Date).toISOString().slice(0, 10)).toBe('2026-11-22');
  });

  it('keeps the stored figure when the count moved by under 3, replaces it at 3, and removes it under the floor', async () => {
    let n = 22;
    const s = setup(() => members(n));
    await s.run();
    n = 24;
    expect(await s.run()).toMatchObject({ kept: 1 });
    expect(stored(s.f)[0]?.members).toBe(22);
    n = 25;
    await s.run();
    expect(stored(s.f)[0]?.members).toBe(25);
    n = 19;
    expect(await s.run()).toMatchObject({ figures: 0, removed: 1 });
    expect(stored(s.f)).toHaveLength(0);
  });

  it('a failing query is a fixed message that carries nothing from the database', async () => {
    const f = createFakePrisma();
    const db = { $queryRaw: vi.fn(async () => Promise.reject(new Error('boom member-secret'))) } as never;
    await expect(runTurnaround({ prisma: f.prisma, db, asOf: '2026-11-22', log })).rejects.toThrow(
      /^turnaround query failed$/,
    );
  });

  it('only rows of members who share are asked for, and the statement never selects a user id into a figure', () => {
    const src = readFileSync(new URL('./run-turnaround.ts', import.meta.url), 'utf8');
    expect(src).toContain('c."shareAnonymously" = true');
    expect(src).toContain('\'SECONDARY_SUBMITTED\'::"MedMilestoneType"');
  });
});
