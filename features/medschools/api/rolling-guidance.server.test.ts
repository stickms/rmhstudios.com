import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from '../scrape/test-support';

const fake = vi.hoisted(() => ({ current: null as null | { prisma: unknown } }));
vi.mock('@/lib/prisma.server', () => ({
  get prisma() {
    return fake.current?.prisma;
  },
}));

import { getRollingGuidance } from './rolling-guidance.server';

const NOW = new Date('2026-11-23T12:00:00Z');
let f: ReturnType<typeof createFakePrisma>;

const school = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  slug: `school-${id}`,
  name: `School ${id}`,
  active: true,
  degree: 'MD',
  ...over,
});
const policy = (schoolId: string, program: 'REG' | 'PHD', rolling: boolean) => ({
  id: `${schoolId}-${program}`,
  schoolId,
  program,
  rolling,
  evidence: `${schoolId} ${program} says ${rolling ? 'rolling' : 'set dates'}.`,
  url: `https://${schoolId}.example/admissions`,
  checkedOn: new Date('2026-11-20T00:00:00Z'),
  source: 'SCHOOL',
});

beforeEach(() => {
  f = createFakePrisma();
  fake.current = f;
  f.tables.medSchool.push(school('a'), school('b'), school('c'), school('off', { active: false }));
  f.tables.medSchoolAdmissionsPolicy.push(
    policy('a', 'REG', true),
    policy('b', 'REG', false),
    policy('off', 'REG', true),
    policy('c', 'REG', true),
  );
  f.tables.medSchoolList.push({ id: 'L1', userId: 'alice', name: 'Secret list name', position: 0 });
  f.tables.medSchoolList.push({ id: 'L2', userId: 'bob', name: 'Bob list', position: 0 });
  f.tables.medSchoolListItem.push(
    { id: 'i3', listId: 'L1', schoolId: 'c', program: 'PHD', note: 'private note', position: 2 },
    { id: 'i1', listId: 'L1', schoolId: 'b', program: 'REG', note: null, position: 0 },
    { id: 'i2', listId: 'L1', schoolId: 'a', program: 'ANY', note: null, position: 1 },
    { id: 'i4', listId: 'L1', schoolId: 'off', program: 'REG', note: null, position: 3 },
    { id: 'i5', listId: 'L2', schoolId: 'c', program: 'REG', note: 'bob note', position: 0 },
  );
});

describe('getRollingGuidance (list)', () => {
  it("orders the member's own list rolling first; an MD-PhD item does not borrow the regular fact; inactive is nowhere", async () => {
    const r = await getRollingGuidance('alice', { source: 'list', list: 'L1' }, NOW);
    if (r === 'not-found') throw new Error('expected a result');
    expect(r.source).toBe('list');
    expect(r.cycleYear).toBe(2027);
    expect(r.schoolCount).toBe(3);
    expect(r.entries.map((e) => [e.slug, e.program, e.kind, e.submitted])).toEqual([
      ['school-a', 'REG', 'rolling', null],
      ['school-b', 'REG', 'set-dates', null],
      ['school-c', 'PHD', 'unknown', null],
    ]);
    const a = r.entries[0]!;
    expect(a).toMatchObject({
      evidence: 'a REG says rolling.',
      url: 'https://a.example/admissions',
      checkedOn: '2026-11-20',
    });
    expect(r.entries[2]).toMatchObject({ evidence: null, url: null, checkedOn: null });
    expect(JSON.stringify(r)).not.toMatch(/off|Secret list name|private note|bob/);
  });

  it('pins the response and entry key sets, with no user, list, item or note', async () => {
    const r = await getRollingGuidance('alice', { source: 'list', list: 'L1' }, NOW);
    if (r === 'not-found') throw new Error('expected a result');
    expect(Object.keys(r).sort()).toEqual(['cycleYear', 'entries', 'schoolCount', 'source']);
    expect(Object.keys(r.entries[0]!).sort()).toEqual(
      ['checkedOn', 'degree', 'evidence', 'kind', 'program', 'schoolName', 'slug', 'submitted', 'url'].sort(),
    );
  });

  it("another member's list is not-found, the same as a missing one", async () => {
    expect(await getRollingGuidance('bob', { source: 'list', list: 'L1' }, NOW)).toBe('not-found');
    expect(await getRollingGuidance('alice', { source: 'list', list: 'nope' }, NOW)).toBe('not-found');
  });

  it('an empty list is an empty result', async () => {
    f.tables.medSchoolList.push({ id: 'L3', userId: 'alice', name: 'Empty', position: 1 });
    expect(await getRollingGuidance('alice', { source: 'list', list: 'L3' }, NOW)).toMatchObject({
      entries: [],
      schoolCount: 0,
    });
  });

  it('reads the policies of every school in one query', async () => {
    const real = f.prisma.medSchoolAdmissionsPolicy.findMany.bind(f.prisma.medSchoolAdmissionsPolicy);
    let calls = 0;
    f.prisma.medSchoolAdmissionsPolicy.findMany = async (a) => {
      calls += 1;
      return real(a);
    };
    await getRollingGuidance('alice', { source: 'list', list: 'L1' }, NOW);
    expect(calls).toBe(1);
  });
});

describe('getRollingGuidance (tracker)', () => {
  const at = (n: number) => new Date(Date.UTC(2026, 5, n));
  beforeEach(() => {
    f.tables.medTrackerCycle.push(
      { id: 'ca', userId: 'alice', cycleYear: 2027 },
      { id: 'ca-old', userId: 'alice', cycleYear: 2026 },
      { id: 'cb', userId: 'bob', cycleYear: 2027 },
    );
    f.tables.medTrackerApplication.push(
      { id: 'x1', cycleId: 'ca', schoolId: 'a', program: 'REG', createdAt: at(1) },
      { id: 'x2', cycleId: 'ca', schoolId: 'c', program: 'REG', createdAt: at(2) },
      { id: 'x3', cycleId: 'ca-old', schoolId: 'b', program: 'REG', createdAt: at(3) },
      { id: 'x4', cycleId: 'cb', schoolId: 'b', program: 'REG', createdAt: at(4) },
    );
    f.tables.medTrackerMilestone.push({ id: 'm1', applicationId: 'x1', type: 'SUBMITTED', date: at(10) });
  });

  it("reads the caller's current-cycle applications only; a school with no step recorded leads inside its kind", async () => {
    const r = await getRollingGuidance('alice', { source: 'tracker' }, NOW);
    if (r === 'not-found') throw new Error('expected a result');
    expect(r.source).toBe('tracker');
    expect(r.schoolCount).toBe(2);
    expect(r.entries.map((e) => [e.slug, e.kind, e.submitted])).toEqual([
      ['school-c', 'rolling', false],
      ['school-a', 'rolling', true],
    ]);
  });

  it('an MD-PhD application reads the MD-PhD fact only', async () => {
    f.tables.medTrackerApplication.push({ id: 'x5', cycleId: 'ca', schoolId: 'b', program: 'PHD', createdAt: at(5) });
    const r = await getRollingGuidance('alice', { source: 'tracker' }, NOW);
    if (r === 'not-found') throw new Error('expected a result');
    expect(r.entries.find((e) => e.slug === 'school-b')).toMatchObject({ program: 'PHD', kind: 'unknown' });
  });

  it('a member with no application this cycle gets an empty result', async () => {
    expect(await getRollingGuidance('carol', { source: 'tracker' }, NOW)).toMatchObject({
      entries: [],
      schoolCount: 0,
    });
  });

  it("every read of a private table carries the caller's user id", async () => {
    const wheres: { table: string; where: Record<string, unknown> }[] = [];
    for (const t of ['medSchoolList', 'medTrackerCycle'] as const) {
      const d = (f.prisma as unknown as Record<string, unknown>)[t] as {
        findFirst: (a?: { where?: Record<string, unknown> }) => Promise<unknown>;
      };
      const real = d.findFirst.bind(d);
      d.findFirst = async (a) => {
        wheres.push({ table: t, where: a?.where ?? {} });
        return real(a);
      };
    }
    await getRollingGuidance('alice', { source: 'list', list: 'L1' }, NOW);
    await getRollingGuidance('alice', { source: 'tracker' }, NOW);
    expect(wheres).toHaveLength(2);
    for (const w of wheres) expect(w.where.userId, w.table).toBe('alice');
  });
});
