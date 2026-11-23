import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from '../scrape/test-support';
import { importSaveBody } from './import-schemas';

const fake = vi.hoisted(() => ({ current: null as null | { prisma: unknown } }));
vi.mock('@/lib/prisma.server', () => ({
  get prisma() {
    return fake.current?.prisma;
  },
}));

import { getTracker, importMilestones, putCycle, putMilestone } from './tracker.server';
import { addApplication } from './tracker.server';

const SECRET = 'unit-test-secret-0123456789';
const NOW = new Date('2026-11-20T12:00:00.000Z');
const OLD = new Date('2026-01-01T00:00:00.000Z');
let f: ReturnType<typeof createFakePrisma>;

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
const rmh = () => f.tables.medCycleEvent.filter((e) => (e as { source: string }).source === 'RMH');
const ms = (type: string, date: string, overwrite = false) => ({ type: type as 'SUBMITTED', date, overwrite });

beforeEach(() => {
  process.env.MEDSCHOOLS_DEDUPE_SECRET = SECRET;
  f = createFakePrisma();
  fake.current = f;
  f.tables.user.push({ id: 'a', createdAt: OLD }, { id: 'b', createdAt: OLD });
  f.tables.medSchool.push(school('x'), school('y'), school('off', { active: false }));
});
afterEach(() => {
  delete process.env.MEDSCHOOLS_DEDUPE_SECRET;
});

const days = async (userId: string, slug: string) =>
  (await getTracker(userId, 2027)).cycle?.applications.find((a) => a.school.slug === slug)?.milestones.map((m) => `${m.type}:${m.date}`);

describe('importMilestones', () => {
  it('creates the cycle, the schools and the dates; a new cycle starts unshared', async () => {
    const r = await importMilestones(
      'a',
      {
        cycleYear: 2027,
        rows: [
          { slug: 'school-x', program: 'REG', milestones: [ms('SUBMITTED', '2026-06-12'), ms('INTERVIEW', '2026-10-05')] },
          { slug: 'school-y', program: 'PHD', milestones: [ms('COMPLETE', '2026-07-08')] },
        ],
      },
      NOW,
    );
    expect(r).toEqual({ cycleYear: 2027, schoolsAdded: 2, added: 3, overwritten: 0, unchanged: 0, conflicts: 0, invalid: 0 });
    expect(await days('a', 'school-x')).toEqual(['SUBMITTED:2026-06-12', 'INTERVIEW:2026-10-05']);
    expect((await getTracker('a', 2027)).cycle?.shareAnonymously).toBe(false);
    expect(rmh()).toHaveLength(0);
  });

  it('conflict rule: an existing different date stays unless the row says overwrite; the same date is unchanged', async () => {
    await putCycle('a', { cycleYear: 2027, shareAnonymously: false }, NOW);
    const added = await addApplication('a', { cycleYear: 2027, schoolSlug: 'school-x', program: 'REG' });
    if (typeof added === 'string') throw new Error(added);
    await putMilestone('a', added.id, 'SUBMITTED', '2026-06-01', NOW);
    await putMilestone('a', added.id, 'COMPLETE', '2026-07-08', NOW);
    const rows = (overwrite: boolean) => [
      {
        slug: 'school-x',
        program: 'REG' as const,
        milestones: [ms('SUBMITTED', '2026-06-12', overwrite), ms('COMPLETE', '2026-07-08'), ms('INTERVIEW', '2026-10-05')],
      },
    ];
    const first = await importMilestones('a', { cycleYear: 2027, rows: rows(false) }, NOW);
    expect(first).toMatchObject({ schoolsAdded: 0, added: 1, overwritten: 0, unchanged: 1, conflicts: 1 });
    expect(await days('a', 'school-x')).toEqual(['SUBMITTED:2026-06-01', 'COMPLETE:2026-07-08', 'INTERVIEW:2026-10-05']);
    const second = await importMilestones('a', { cycleYear: 2027, rows: rows(true) }, NOW);
    expect(second).toMatchObject({ added: 0, overwritten: 1, unchanged: 2, conflicts: 0 });
    expect(await days('a', 'school-x')).toEqual(['SUBMITTED:2026-06-12', 'COMPLETE:2026-07-08', 'INTERVIEW:2026-10-05']);
  });

  it('sharing follows the cycle: on, the shareable dates become events, as for a date typed by hand; the private ones never do', async () => {
    await putCycle('a', { cycleYear: 2027, shareAnonymously: true }, NOW);
    await importMilestones(
      'a',
      { cycleYear: 2027, rows: [{ slug: 'school-x', program: 'REG', milestones: [ms('SUBMITTED', '2026-06-12'), ms('INTERVIEW', '2026-10-05'), ms('ACCEPTANCE', '2026-11-02')] }] },
      NOW,
    );
    expect(rmh().map((e) => (e as { eventType: string }).eventType).sort()).toEqual(['ACCEPTANCE', 'INTERVIEW']);
    // overwriting moves the event, it does not add one
    await importMilestones(
      'a',
      { cycleYear: 2027, rows: [{ slug: 'school-x', program: 'REG', milestones: [ms('INTERVIEW', '2026-10-09', true)] }] },
      NOW,
    );
    expect(rmh()).toHaveLength(2);
    expect(rmh().some((e) => String((e as { occurredAt: Date }).occurredAt.toISOString()).startsWith('2026-10-09'))).toBe(true);
  });

  it('an unshared cycle writes no event at all', async () => {
    await putCycle('a', { cycleYear: 2027, shareAnonymously: false }, NOW);
    await importMilestones('a', { cycleYear: 2027, rows: [{ slug: 'school-x', program: 'REG', milestones: [ms('INTERVIEW', '2026-10-05')] }] }, NOW);
    expect(rmh()).toHaveLength(0);
  });

  it('counts a bad date or an inactive or unknown school as invalid and writes only the rest', async () => {
    const r = await importMilestones(
      'a',
      {
        cycleYear: 2027,
        rows: [
          { slug: 'school-x', program: 'REG', milestones: [ms('SUBMITTED', '2026-06-12'), ms('COMPLETE', '2030-01-01'), ms('INTERVIEW', '2027-05-05')] },
          { slug: 'school-off', program: 'REG', milestones: [ms('SUBMITTED', '2026-06-12')] },
          { slug: 'nope', program: 'REG', milestones: [ms('SUBMITTED', '2026-06-12'), ms('COMPLETE', '2026-06-12')] },
        ],
      },
      NOW,
    );
    expect(r).toMatchObject({ schoolsAdded: 1, added: 1, invalid: 5 });
    expect(await days('a', 'school-x')).toEqual(['SUBMITTED:2026-06-12']);
  });

  it('an import with nothing writable makes no cycle', async () => {
    const r = await importMilestones('a', { cycleYear: 2027, rows: [{ slug: 'nope', program: 'REG', milestones: [ms('SUBMITTED', '2026-06-12')] }] }, NOW);
    expect(r).toMatchObject({ schoolsAdded: 0, added: 0, invalid: 1 });
    expect((await getTracker('a')).cycles).toEqual([]);
  });

  it('refuses all of it when the schools would pass the cap, writing nothing', async () => {
    for (let i = 0; i < 61; i += 1) f.tables.medSchool.push(school(`s${i}`));
    const rows = Array.from({ length: 61 }, (_, i) => ({ slug: `school-s${i}`, program: 'REG' as const, milestones: [ms('SUBMITTED', '2026-06-12')] }));
    const r = await importMilestones('a', { cycleYear: 2027, rows }, NOW);
    expect(r).toEqual({ cap: { existing: 0, adding: 61 } });
    expect((await getTracker('a')).cycles).toEqual([]);
  });

  it('writes only the caller\'s tracker: another member\'s rows are untouched', async () => {
    await importMilestones('b', { cycleYear: 2027, rows: [{ slug: 'school-x', program: 'REG', milestones: [ms('SUBMITTED', '2026-06-01')] }] }, NOW);
    await importMilestones('a', { cycleYear: 2027, rows: [{ slug: 'school-x', program: 'REG', milestones: [ms('SUBMITTED', '2026-06-12', true)] }] }, NOW);
    expect(await days('b', 'school-x')).toEqual(['SUBMITTED:2026-06-01']);
    expect(await days('a', 'school-x')).toEqual(['SUBMITTED:2026-06-12']);
  });

  it('a cycle outside the tracker window is null', async () => {
    expect(await importMilestones('a', { cycleYear: 2050, rows: [{ slug: 'school-x', program: 'REG', milestones: [ms('SUBMITTED', '2049-06-12')] }] }, NOW)).toBeNull();
  });
});

describe('the save body', () => {
  const ok = { cycleYear: 2027, rows: [{ slug: 'harvard', program: 'REG', milestones: [{ type: 'SUBMITTED', date: '2026-06-12', overwrite: false }] }] };
  it('accepts a well-formed body', () => {
    expect(importSaveBody.safeParse(ok).success).toBe(true);
  });
  it('rejects ids, unknown keys, unknown types, bad dates, empty rows and too many rows', () => {
    const bad = (rows: unknown, extra: Record<string, unknown> = {}) => importSaveBody.safeParse({ ...ok, ...extra, rows }).success;
    const row = ok.rows[0]!;
    expect(bad([{ ...row, applicationId: 'cx' }])).toBe(false);
    expect(bad([{ ...row, milestones: [{ type: 'ESSAY', date: '2026-06-12', overwrite: false }] }])).toBe(false);
    expect(bad([{ ...row, milestones: [{ type: 'SUBMITTED', date: 'June 12', overwrite: false }] }])).toBe(false);
    expect(bad([{ ...row, milestones: [{ type: 'SUBMITTED', date: '2026-06-12' }] }])).toBe(false);
    expect(bad([{ ...row, milestones: [] }])).toBe(false);
    expect(bad([])).toBe(false);
    expect(bad(Array.from({ length: 81 }, () => row))).toBe(false);
    expect(bad([row], { userId: 'x' })).toBe(false);
    expect(importSaveBody.safeParse({ ...ok, cycleYear: 1999 }).success).toBe(false);
  });
});
