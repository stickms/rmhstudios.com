import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from '../scrape/test-support';
import { getChances } from './chances.server';

const fake = vi.hoisted(() => ({ current: null as null | { prisma: unknown } }));
vi.mock('@/lib/prisma.server', () => ({
  get prisma() {
    return fake.current?.prisma;
  },
}));

const NOW = new Date('2026-11-20T12:00:00.000Z');
let f: ReturnType<typeof createFakePrisma>;

const ms = (day: string) => new Date(`${day}T00:00:00.000Z`);
const school = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  slug: `school-${id}`,
  name: `School ${id}`,
  shortName: id.toUpperCase(),
  degree: 'MD',
  state: 'NC',
  active: true,
  ...over,
});
/** Weekly steps (R13): S = 0.7 from week 2, 0.5 from week 4, 0.3 from week 6; 27, 20 and 12 members at risk there. */
const CURVE = { t: [14, 28, 42], s: [0.7, 0.5, 0.3], n: [27, 20, 12] };

let nextId = 0;
/** One tracker application of `user` at `schoolId` with the given milestones. */
function apply(
  user: string,
  schoolId: string,
  milestones: Record<string, string>,
  opts: { program?: string; cycleYear?: number } = {},
) {
  const cycleYear = opts.cycleYear ?? 2027;
  let cycle = f.tables.medTrackerCycle.find(
    (c) =>
      (c as { userId: string; cycleYear: number }).userId === user &&
      (c as { cycleYear: number }).cycleYear === cycleYear,
  ) as { id: string } | undefined;
  if (!cycle) {
    cycle = {
      id: `cy-${user}-${cycleYear}`,
      userId: user,
      cycleYear,
      homeState: null,
      shareAnonymously: true,
    } as never;
    f.tables.medTrackerCycle.push(cycle);
  }
  const id = `app-${++nextId}`;
  f.tables.medTrackerApplication.push({ id, cycleId: cycle.id, schoolId, program: opts.program ?? 'REG', notes: null });
  for (const [type, date] of Object.entries(milestones)) {
    f.tables.medTrackerMilestone.push({ id: `m-${++nextId}`, applicationId: id, type, date: ms(date) });
  }
  return id;
}
const curveRow = (schoolId: string, over: Record<string, unknown> = {}) =>
  f.tables.medWaitCurve.push({
    id: `c-${schoolId}`,
    schoolId,
    program: 'REG',
    curve: CURVE,
    members: 27,
    invited: 12,
    maxDay: 90,
    asOf: ms('2026-11-19'),
    ...over,
  });

beforeEach(() => {
  process.env.MEDSCHOOLS_DEDUPE_SECRET = 'unit-test-secret-0123456789';
  f = createFakePrisma();
  fake.current = f;
  f.tables.medSchool.push(school('x'), school('y'), school('off', { active: false }));
});
afterEach(() => {
  delete process.env.MEDSCHOOLS_DEDUPE_SECRET;
});

describe('getChances', () => {
  it('estimates from the curve: percents by calendar date, beyond-maxDay horizons omitted, basis floored to 10', async () => {
    // Complete 20 days ago: week 21, S = 0.7. Targets 28 (0.5 -> 29% -> 30), 35 (0.5 -> 30), 56 (0.3 -> 57% -> 55); 84 is past maxDay 70.
    apply('a', 'x', { COMPLETE: '2026-10-31' });
    curveRow('x', { maxDay: 70 });
    const res = await getChances('a', {}, NOW);
    expect(res.cycleYear).toBe(2027);
    const c = res.chances[0]!;
    expect(c.status).toBe('estimate');
    expect(c.completeOn).toBe('2026-10-31');
    expect(c.asOf).toBe('2026-11-19');
    expect(c.basis).toBe(20);
    expect(c.points).toEqual([
      { on: '2026-11-27', percent: 30 },
      { on: '2026-12-04', percent: 30 },
      { on: '2026-12-20', percent: 55 },
    ]);
    // Non-decreasing in the horizon.
    const p = c.points.map((x) => x.percent);
    expect(p).toEqual([...p].sort((a, b) => a - b));
  });

  it("every percent is a multiple of 5, and the answer is the same for every day of the caller's week", async () => {
    curveRow('x', { maxDay: 70 });
    const pointsFor = async (completeOn: string) => {
      f.tables.medTrackerApplication.length = 0;
      f.tables.medTrackerMilestone.length = 0;
      apply('a', 'x', { COMPLETE: completeOn });
      return (await getChances('a', {}, NOW)).chances[0]!.points;
    };
    // Elapsed 20 and 21 days are both week 21; 24 days is week 28 and may differ.
    const [d20, d21] = [await pointsFor('2026-10-31'), await pointsFor('2026-10-30')];
    expect(d20).toEqual(d21);
    for (const p of [...d20, ...(await pointsFor('2026-10-27'))]) expect(p.percent % 5).toBe(0);
  });

  it('a COMPLETE date in the future is not an estimate', async () => {
    apply('a', 'x', { COMPLETE: '2026-11-25' });
    curveRow('x');
    const c = (await getChances('a', {}, NOW)).chances[0]!;
    expect(c).toMatchObject({ status: 'not-complete-yet', points: [], basis: null, asOf: null });
  });

  it('basis is a multiple of 10 and at least 20', async () => {
    apply('a', 'x', { COMPLETE: '2026-10-31' });
    curveRow('x', { members: 34 });
    expect((await getChances('a', {}, NOW)).chances[0]!.basis).toBe(30);
  });

  it('every other status', async () => {
    apply('a', 'x', { COMPLETE: '2026-10-31', INTERVIEW: '2026-11-10' });
    apply('a', 'y', { COMPLETE: '2026-10-31', REJECTION: '2026-11-10' });
    const res = await getChances('a', {}, NOW);
    const by = new Map(res.chances.map((c) => [c.school.slug, c]));
    expect(by.get('school-x')).toMatchObject({ status: 'invited', invitedOn: '2026-11-10', points: [] });
    expect(by.get('school-y')).toMatchObject({ status: 'closed', invitedOn: null });
  });

  it('no complete date, no curve row (thin), and a curve nobody is still waiting on (beyond)', async () => {
    apply('a', 'x', { SUBMITTED: '2026-10-01' });
    expect((await getChances('a', {}, NOW)).chances[0]!.status).toBe('no-complete');
    f.tables.medTrackerApplication.length = 0;
    f.tables.medTrackerMilestone.length = 0;
    apply('a', 'x', { COMPLETE: '2026-10-31' });
    expect((await getChances('a', {}, NOW)).chances[0]!.status).toBe('thin');
    curveRow('x', { curve: { t: [7], s: [0.01], n: [30] }, maxDay: 90 });
    expect((await getChances('a', {}, NOW)).chances[0]!.status).toBe('beyond');
  });

  it('a curve is per program: a PHD application does not read the REG curve', async () => {
    apply('a', 'x', { COMPLETE: '2026-10-31' }, { program: 'PHD' });
    curveRow('x');
    expect((await getChances('a', {}, NOW)).chances[0]!.status).toBe('thin');
  });

  it('an inactive school is absent; `school` filters by slug', async () => {
    apply('a', 'off', { COMPLETE: '2026-10-31' });
    apply('a', 'x', { COMPLETE: '2026-10-31' });
    apply('a', 'y', { COMPLETE: '2026-10-31' });
    expect((await getChances('a', {}, NOW)).chances.map((c) => c.school.slug)).toEqual(['school-x', 'school-y']);
    expect((await getChances('a', { school: 'school-y' }, NOW)).chances.map((c) => c.school.slug)).toEqual([
      'school-y',
    ]);
  });

  it('a member with no cycle gets an empty answer', async () => {
    expect(await getChances('nobody', {}, NOW)).toEqual({ cycleYear: null, chances: [] });
  });
});

describe('privacy', () => {
  it("has only the pinned keys, no user id, and never carries another member's date", async () => {
    apply('a', 'x', { COMPLETE: '2026-10-31' });
    apply('b', 'x', { COMPLETE: '2026-09-17', INTERVIEW: '2026-10-05' });
    curveRow('x');
    const res = await getChances('a', {}, NOW);
    expect(Object.keys(res).sort()).toEqual(['chances', 'cycleYear']);
    expect(Object.keys(res.chances[0]!).sort()).toEqual([
      'applicationId',
      'asOf',
      'basis',
      'completeOn',
      'invitedOn',
      'points',
      'program',
      'school',
      'status',
    ]);
    expect(Object.keys(res.chances[0]!.school).sort()).toEqual(['active', 'name', 'shortName', 'slug']);
    const text = JSON.stringify(res);
    expect(text).not.toContain('2026-09-17');
    expect(text).not.toContain('2026-10-05');
    expect(text).not.toContain('userId');
    expect(res.chances).toHaveLength(1);
  });

  it("reads curve rows for the caller's own school x program pairs and no milestone outside the caller's cycles", async () => {
    apply('a', 'x', { COMPLETE: '2026-10-31' });
    const bApp = apply('b', 'y', { COMPLETE: '2026-09-17' });
    curveRow('x');
    curveRow('y');
    const seen: { model: string; where: unknown }[] = [];
    const prisma = f.prisma as unknown as Record<string, Record<string, (...a: unknown[]) => unknown>>;
    for (const model of ['medTrackerMilestone', 'medTrackerApplication', 'medTrackerCycle', 'medWaitCurve']) {
      const orig = prisma[model]!.findMany!.bind(prisma[model]);
      prisma[model]!.findMany = (...a: unknown[]) => {
        seen.push({ model, where: (a[0] as { where?: unknown } | undefined)?.where });
        return orig(...a);
      };
    }
    await getChances('a', {}, NOW);
    const curve = seen.find((s) => s.model === 'medWaitCurve')!;
    expect(curve.where).toEqual({ OR: [{ schoolId: 'x', program: 'REG' }] });
    const apps = seen.find((s) => s.model === 'medTrackerApplication')!;
    expect(apps.where).toEqual({ cycleId: 'cy-a-2027' });
    const ms = seen.filter((s) => s.model === 'medTrackerMilestone');
    for (const m of ms) expect(JSON.stringify(m.where)).not.toContain(bApp);
    expect(JSON.stringify(seen)).not.toContain('"b"');
  });
});
