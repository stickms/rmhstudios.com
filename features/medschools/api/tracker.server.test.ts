import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from '../scrape/test-support';
import { AccountTooNewError, SharingUnavailableError } from './share-sync.server';
import { addApplicationBody, patchApplicationBody, putCycleBody, putMilestoneBody } from './me-schemas';

const fake = vi.hoisted(() => ({ current: null as null | { prisma: unknown } }));
vi.mock('@/lib/prisma.server', () => ({
  get prisma() {
    return fake.current?.prisma;
  },
}));

import {
  addApplication,
  deleteApplication,
  deleteCycle,
  deleteMilestone,
  getTracker,
  patchApplication,
  putCycle,
  putMilestone,
} from './tracker.server';

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
const counts = () =>
  f.tables.medCycleCount.filter(
    (e) => (e as { source: string; count: number }).source === 'RMH' && (e as { count: number }).count > 0,
  );
const snapshot = () => JSON.stringify(f.tables);

beforeEach(() => {
  process.env.MEDSCHOOLS_DEDUPE_SECRET = SECRET;
  f = createFakePrisma();
  fake.current = f;
  f.tables.user.push({ id: 'a', createdAt: OLD }, { id: 'b', createdAt: OLD }, { id: 'new', createdAt: NOW });
  f.tables.medSchool.push(school('x'), school('y'), school('off', { active: false }), school('do', { degree: 'DO' }));
});
afterEach(() => {
  delete process.env.MEDSCHOOLS_DEDUPE_SECRET;
});

/** User a, cycle 2027, one application at x (REG). */
async function seed(share = false, userId = 'a') {
  await putCycle(userId, { cycleYear: 2027, shareAnonymously: share }, NOW);
  const app = await addApplication(userId, { cycleYear: 2027, schoolSlug: 'school-x', program: 'REG' });
  if (typeof app === 'string') throw new Error(app);
  return app.id;
}

describe('scoping (another user is the same answer as missing)', () => {
  it('answers null/false for user B and mutates nothing', async () => {
    const id = await seed(true);
    await putMilestone('a', id, 'INTERVIEW', '2026-11-18', NOW);
    const before = snapshot();
    expect(await patchApplication('b', id, 'x')).toBeNull();
    expect(await putMilestone('b', id, 'INTERVIEW', '2026-11-19', NOW)).toBeNull();
    expect(await deleteMilestone('b', id, 'INTERVIEW')).toBeNull();
    expect(await deleteApplication('b', id)).toBe(false);
    expect(await deleteCycle('b', 2027)).toBe(false);
    expect(await addApplication('b', { cycleYear: 2027, schoolSlug: 'school-y', program: 'REG' })).toBe(
      'cycle-missing',
    );
    expect(snapshot()).toBe(before);
    expect(rmh()).toHaveLength(1);
  });

  it('a missing id is null', async () => {
    expect(await patchApplication('a', 'nope', null)).toBeNull();
    expect(await putMilestone('a', 'nope', 'HOLD', '2026-11-18', NOW)).toBeNull();
    expect(await deleteApplication('a', 'nope')).toBe(false);
  });
});

describe('cycle', () => {
  it('creates, returns the cycle and lists years newest first', async () => {
    await putCycle('a', { cycleYear: 2026, shareAnonymously: false }, NOW);
    const t = await putCycle('a', { cycleYear: 2027, homeState: ' nc ', shareAnonymously: false }, NOW);
    expect(t.cycles).toEqual([2027, 2026]);
    expect(t.cycle).toMatchObject({ cycleYear: 2027, homeState: 'NC', shareAnonymously: false, applications: [] });
    expect(t.sharingAvailable).toBe(true);
  });

  it('leaves the home state alone when omitted and clears it on null', async () => {
    await putCycle('a', { cycleYear: 2027, homeState: 'NC', shareAnonymously: false }, NOW);
    expect((await putCycle('a', { cycleYear: 2027, shareAnonymously: false }, NOW)).cycle?.homeState).toBe('NC');
    expect(
      (await putCycle('a', { cycleYear: 2027, homeState: null, shareAnonymously: false }, NOW)).cycle?.homeState,
    ).toBeNull();
  });

  it('shares existing milestones when switched on and removes the events when switched off', async () => {
    const id = await seed(false);
    await putMilestone('a', id, 'INTERVIEW', '2026-11-18', NOW);
    await putMilestone('a', id, 'COMPLETE', '2026-11-01', NOW);
    expect(rmh()).toHaveLength(0);
    await putCycle('a', { cycleYear: 2027, shareAnonymously: true }, NOW);
    expect(rmh()).toHaveLength(1);
    expect(counts()).toHaveLength(1);
    await putCycle('a', { cycleYear: 2027, shareAnonymously: false }, NOW);
    expect(rmh()).toHaveLength(0);
    expect(counts()).toHaveLength(0);
  });

  it('refuses to switch sharing on for a new account or without the secret, writing nothing', async () => {
    const before = snapshot();
    await expect(putCycle('new', { cycleYear: 2027, shareAnonymously: true }, NOW)).rejects.toBeInstanceOf(
      AccountTooNewError,
    );
    expect(snapshot()).toBe(before);
    delete process.env.MEDSCHOOLS_DEDUPE_SECRET;
    await expect(putCycle('a', { cycleYear: 2027, shareAnonymously: true }, NOW)).rejects.toBeInstanceOf(
      SharingUnavailableError,
    );
    expect(snapshot()).toBe(before);
    // Unshared still works without the secret, and the tracker says sharing is unavailable.
    const t = await putCycle('a', { cycleYear: 2027, shareAnonymously: false }, NOW);
    expect(t.sharingAvailable).toBe(false);
  });

  it('deleteCycle removes applications, milestones, events and re-rolls the cells of two schools', async () => {
    const id = await seed(true);
    const second = await addApplication('a', { cycleYear: 2027, schoolSlug: 'school-y', program: 'PHD' });
    if (typeof second === 'string') throw new Error(second);
    await putMilestone('a', id, 'INTERVIEW', '2026-11-18', NOW);
    await putMilestone('a', second.id, 'ACCEPTANCE', '2026-11-19', NOW);
    expect(counts()).toHaveLength(2);
    expect(await deleteCycle('a', 2027)).toBe(true);
    expect(f.tables.medTrackerCycle).toHaveLength(0);
    expect(f.tables.medTrackerApplication).toHaveLength(0);
    expect(f.tables.medTrackerMilestone).toHaveLength(0);
    expect(rmh()).toHaveLength(0);
    expect(counts()).toHaveLength(0);
    expect(await deleteCycle('a', 2027)).toBe(false);
  });
});

describe('addApplication', () => {
  it('refuses a duplicate, an inactive or unknown school, and the 61st application', async () => {
    await putCycle('a', { cycleYear: 2027, shareAnonymously: false }, NOW);
    expect(await addApplication('a', { cycleYear: 2027, schoolSlug: 'school-x', program: 'REG' })).toMatchObject({
      program: 'REG',
    });
    expect(await addApplication('a', { cycleYear: 2027, schoolSlug: 'school-x', program: 'REG' })).toBe('duplicate');
    expect(await addApplication('a', { cycleYear: 2027, schoolSlug: 'school-off', program: 'REG' })).toBe(
      'school-missing',
    );
    expect(await addApplication('a', { cycleYear: 2027, schoolSlug: 'nope', program: 'REG' })).toBe('school-missing');
    expect(await addApplication('a', { cycleYear: 2026, schoolSlug: 'school-y', program: 'REG' })).toBe(
      'cycle-missing',
    );
    const cycleId = (f.tables.medTrackerCycle[0] as { id: string }).id;
    for (let i = 0; i < 59; i += 1) {
      f.tables.medTrackerApplication.push({ id: `pad${i}`, cycleId, schoolId: `pad-school-${i}`, program: 'REG' });
    }
    expect(await addApplication('a', { cycleYear: 2027, schoolSlug: 'school-y', program: 'REG' })).toBe('cap');
  });

  it('allows PHD for a DO school and a second program at the same school', async () => {
    await putCycle('a', { cycleYear: 2027, shareAnonymously: false }, NOW);
    expect(await addApplication('a', { cycleYear: 2027, schoolSlug: 'school-do', program: 'PHD' })).toMatchObject({
      program: 'PHD',
      school: { degree: 'DO' },
    });
    expect(await addApplication('a', { cycleYear: 2027, schoolSlug: 'school-do', program: 'REG' })).toMatchObject({
      program: 'REG',
    });
  });
});

describe('milestones', () => {
  it('rejects bad dates with bad-date and writes nothing', async () => {
    const id = await seed(true);
    const before = snapshot();
    for (const d of ['2026-02-30', '2026-04-30', '2027-09-01', '2026-11-22', '0099-01-01', '2026-11-20T10:00']) {
      expect(await putMilestone('a', id, 'INTERVIEW', d, NOW), d).toBe('bad-date');
    }
    expect(snapshot()).toBe(before);
  });

  it('a second PUT of a type moves its date: one row, the event moves between cells', async () => {
    const id = await seed(true);
    await putMilestone('a', id, 'INTERVIEW', '2026-11-18', NOW);
    const first = counts()[0] as { date: Date };
    const dto = await putMilestone('a', id, 'INTERVIEW', '2026-11-19', NOW);
    expect(dto).toMatchObject({ milestones: [{ type: 'INTERVIEW', date: '2026-11-19' }] });
    expect(f.tables.medTrackerMilestone).toHaveLength(1);
    expect(rmh()).toHaveLength(1);
    expect(counts()).toHaveLength(1);
    expect((counts()[0] as { date: Date }).date.toISOString()).not.toBe(first.date.toISOString());
  });

  it('a type that cannot be shared writes no event; deleting a shared milestone removes its event first', async () => {
    const id = await seed(true);
    await putMilestone('a', id, 'SUBMITTED', '2026-06-20', NOW);
    expect(rmh()).toHaveLength(0);
    await putMilestone('a', id, 'SECONDARY', '2026-07-10', NOW);
    expect(rmh()).toHaveLength(1);
    const dto = await deleteMilestone('a', id, 'SECONDARY');
    expect(dto?.milestones.map((m) => m.type)).toEqual(['SUBMITTED']);
    expect(rmh()).toHaveLength(0);
    expect(counts()).toHaveLength(0);
  });

  it('orders by date, then by type', async () => {
    const id = await seed(false);
    await putMilestone('a', id, 'INTERVIEW', '2026-10-05', NOW);
    await putMilestone('a', id, 'COMPLETE', '2026-08-01', NOW);
    await putMilestone('a', id, 'SUBMITTED', '2026-08-01', NOW);
    const t = await getTracker('a');
    expect(t.cycle?.applications[0]?.milestones.map((m) => m.type)).toEqual(['SUBMITTED', 'COMPLETE', 'INTERVIEW']);
  });

  it('deleteApplication with sharing on removes events and counts', async () => {
    const id = await seed(true);
    await putMilestone('a', id, 'REJECTION', '2026-11-18', NOW);
    expect(await deleteApplication('a', id)).toBe(true);
    expect(f.tables.medTrackerMilestone).toHaveLength(0);
    expect(rmh()).toHaveLength(0);
    expect(counts()).toHaveLength(0);
  });
});

describe('what the tracker returns', () => {
  it('carries no user id, cycle id, hash or in-state, and keeps an inactive school visible', async () => {
    const id = await seed(true);
    await putMilestone('a', id, 'INTERVIEW', '2026-11-18', NOW);
    (f.tables.medSchool[0] as { active: boolean }).active = false;
    const t = await getTracker('a');
    const text = JSON.stringify(t);
    expect(text).not.toMatch(/userId|cycleId|dedupeHash|inState/);
    expect(Object.keys(t).sort()).toEqual(['cycle', 'cycles', 'sharingAvailable']);
    expect(t.cycle?.applications[0]?.school).toMatchObject({ slug: 'school-x', active: false });
    for (const e of f.tables.medCycleEvent) {
      expect(text).not.toContain((e as { dedupeHash: string }).dedupeHash);
    }
  });

  it('a year with no cycle is null and a user with nothing gets an empty tracker', async () => {
    expect(await getTracker('a')).toEqual({ sharingAvailable: true, cycles: [], cycle: null });
    await seed(false);
    expect((await getTracker('a', 2026)).cycle).toBeNull();
  });

  it('notes: markup is returned verbatim, NUL is stripped, empty clears', async () => {
    const id = await seed(false);
    expect((await patchApplication('a', id, '<b>x</b>\u0000'))?.notes).toBe('<b>x</b>');
    expect((await patchApplication('a', id, '   '))?.notes).toBeNull();
    expect((await patchApplication('a', id, null))?.notes).toBeNull();
  });
});

describe('schemas', () => {
  it('reject unknown keys, bad years, bad home states and over-long notes', () => {
    expect(putCycleBody.safeParse({ cycleYear: 2027, shareAnonymously: true, userId: 'x' }).success).toBe(false);
    expect(putCycleBody.safeParse({ cycleYear: '2027', shareAnonymously: true }).success).toBe(false);
    expect(putCycleBody.safeParse({ cycleYear: 2027.5, shareAnonymously: true }).success).toBe(false);
    expect(putCycleBody.safeParse({ cycleYear: 2062, shareAnonymously: true }).success).toBe(false);
    for (const homeState of ['zz', 'NC ', '']) {
      const r = putCycleBody.safeParse({ cycleYear: 2027, homeState, shareAnonymously: false });
      expect(r.success, JSON.stringify(homeState)).toBe(homeState !== 'zz');
    }
    expect(putCycleBody.safeParse({ cycleYear: 2027, shareAnonymously: false }).success).toBe(true);
    expect(putCycleBody.safeParse({ cycleYear: 2027 }).success).toBe(false);
    expect(addApplicationBody.safeParse({ cycleYear: 2027, schoolSlug: '../x', program: 'REG' }).success).toBe(false);
    expect(addApplicationBody.safeParse({ cycleYear: 2027, schoolSlug: 'x', program: 'ANY' }).success).toBe(false);
    expect(patchApplicationBody.safeParse({ notes: 'x'.repeat(1001) }).success).toBe(false);
    expect(patchApplicationBody.safeParse({ notes: 'x'.repeat(1000) }).success).toBe(true);
    expect(patchApplicationBody.safeParse({ notes: null }).success).toBe(true);
    for (const date of [20261120, ['2026-11-20'], null, '11/20/2026', '2026-11-20T10:00']) {
      expect(putMilestoneBody.safeParse({ date }).success).toBe(false);
    }
  });
});
