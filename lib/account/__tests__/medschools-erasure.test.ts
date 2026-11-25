/**
 * RMH Med Schools in account deletion (plan Task 6, Review Focus 4 and 7): a member with a shared tracker goes through
 * the real `anonymizeAccount` (and `scheduleDeletion`) against the in-memory fake, and the anonymous events and counts
 * their milestones made go with them, leaving other members' contributions exactly as they were.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from '@features/medschools/scrape/test-support';

const holder = vi.hoisted(() => ({ fake: null as null | { prisma: Record<string, unknown> } }));

vi.mock('@/lib/prisma.server', () => {
  // Models the fake knows are served by it; everything else (the other features' erasure steps) reads as empty.
  const generic = new Proxy(
    {},
    {
      get: (_t, method: string) => async () =>
        method === 'findMany' || method === 'groupBy'
          ? []
          : method === 'count'
            ? 0
            : method.startsWith('find')
              ? null
              : { count: 0 },
    },
  );
  const prisma = new Proxy(
    {},
    {
      get: (_t, key: string) => {
        const f = holder.fake!.prisma;
        if (key === '$transaction') {
          return (arg: unknown) =>
            typeof arg === 'function'
              ? (f.$transaction as (fn: unknown) => unknown)(arg)
              : Promise.all(arg as unknown[]);
        }
        if (key.startsWith('$')) return async () => (key === '$queryRaw' ? [] : 0); // raw SQL of other features' steps
        return key in f ? f[key] : generic;
      },
    },
  );
  return { prisma };
});

import { anonymizeAccount, scheduleDeletion } from '@/lib/account/deletion.server';
import { auditRmh, SharingUnavailableError } from '@features/medschools/api/share-sync.server';
import { addApplication, putCycle, putMilestone } from '@features/medschools/api/tracker.server';
import { exportMedschools } from '@features/medschools/api/export.server';
import { putStats } from '@features/medschools/api/stats.server';
import { putStatsBody } from '@features/medschools/api/stats-schemas';

const SECRET = 'unit-test-secret-0123456789';
const NOW = new Date('2026-11-20T12:00:00.000Z');
const OLD = new Date('2026-01-01T00:00:00.000Z');
let f: ReturnType<typeof createFakePrisma>;

const rmhEvents = () => f.tables.medCycleEvent.filter((e) => (e as { source: string }).source === 'RMH');
const rmhCounts = () =>
  f.tables.medCycleCount.filter(
    (e) => (e as { source: string; count: number }).source === 'RMH' && (e as { count: number }).count > 0,
  );
const audit = () => auditRmh(f.prisma as never, SECRET);
const ZERO = { orphanEvents: 0, mismatchedCells: 0, missingEvents: 0 };

/** u1: two cycles (2027 shared, 2026 not), three applications, six milestones, two lists, prefs. u2 shares one cell. */
async function seed() {
  for (const id of ['u1', 'u2']) f.tables.user.push({ id, createdAt: OLD, banReason: null, deletionScheduledAt: null });
  for (const id of ['x', 'y'])
    f.tables.medSchool.push({
      id,
      slug: `school-${id}`,
      name: id,
      shortName: id,
      degree: 'MD',
      state: 'NC',
      active: true,
    });

  await putCycle('u1', { cycleYear: 2027, shareAnonymously: true }, NOW);
  await putCycle('u1', { cycleYear: 2026, shareAnonymously: false }, NOW);
  const a = await addApplication('u1', { cycleYear: 2027, schoolSlug: 'school-x', program: 'REG' });
  const b = await addApplication('u1', { cycleYear: 2027, schoolSlug: 'school-y', program: 'REG' });
  const c = await addApplication('u1', { cycleYear: 2026, schoolSlug: 'school-x', program: 'REG' });
  if (typeof a === 'string' || typeof b === 'string' || typeof c === 'string') throw new Error('seed');
  await putMilestone('u1', a.id, 'INTERVIEW', '2026-11-18', NOW);
  await putMilestone('u1', a.id, 'SUBMITTED', '2026-06-20', NOW);
  await putMilestone('u1', b.id, 'ACCEPTANCE', '2026-11-19', NOW);
  await putMilestone('u1', b.id, 'WAITLIST', '2026-11-19', NOW);
  await putMilestone('u1', c.id, 'REJECTION', '2025-12-01', NOW);
  await putMilestone('u1', c.id, 'SECONDARY', '2025-08-01', NOW);

  await putCycle('u2', { cycleYear: 2027, shareAnonymously: true }, NOW);
  const d = await addApplication('u2', { cycleYear: 2027, schoolSlug: 'school-x', program: 'REG' });
  if (typeof d === 'string') throw new Error('seed');
  await putMilestone('u2', d.id, 'INTERVIEW', '2026-11-18', NOW);

  f.tables.medSchoolList.push(
    { id: 'l1', userId: 'u1', name: 'My schools', position: 0 },
    { id: 'l2', userId: 'u1', name: 'Reach', position: 1 },
  );
  f.tables.medSchoolListItem.push({ id: 'i1', listId: 'l1', schoolId: 'x', program: null, note: null, position: 0 });
  f.tables.medUserPrefs.push({
    userId: 'u1',
    programFilter: 'PHD',
    degree: null,
    homeState: null,
    chartCategories: [],
  });
}

beforeEach(() => {
  process.env.MEDSCHOOLS_DEDUPE_SECRET = SECRET;
  f = createFakePrisma();
  holder.fake = f as never;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  delete process.env.MEDSCHOOLS_DEDUPE_SECRET;
  vi.restoreAllMocks();
});

const mine = (t: string) => f.tables[t]!.filter((r) => (r as { userId?: string }).userId === 'u1');

describe('anonymizeAccount with a sharing tracker', () => {
  it('removes every event and count the member contributed, and only those, leaving the audit clean', async () => {
    await seed();
    expect(rmhEvents()).toHaveLength(4); // u1: INTERVIEW, ACCEPTANCE, WAITLIST (2027) + REJECTION is unshared (2026); u2: INTERVIEW
    // Cell x/INTERVIEW/2026-11-18 holds both members.
    expect(rmhCounts().find((c) => (c as { schoolId: string }).schoolId === 'x')).toMatchObject({
      count: 2,
      contributors: 2,
    });
    expect(await audit()).toEqual(ZERO);

    await anonymizeAccount('u1');

    expect(rmhEvents()).toHaveLength(1);
    expect(rmhCounts()).toHaveLength(1);
    expect(rmhCounts()[0]).toMatchObject({ schoolId: 'x', eventType: 'INTERVIEW', count: 1, contributors: 1 });
    expect(await audit()).toEqual(ZERO);
    expect(mine('medTrackerCycle')).toHaveLength(0);
    expect(f.tables.medTrackerApplication.map((a) => (a as { id: string }).id)).toHaveLength(1); // u2's only
    expect(f.tables.medTrackerMilestone).toHaveLength(1);
    expect(f.tables.medSchoolList).toHaveLength(0);
    expect(f.tables.medSchoolListItem).toHaveLength(0);
    expect(f.tables.medUserPrefs).toHaveLength(0);
    expect(f.tables.medTrackerCycle).toHaveLength(1); // u2's
  });

  it('a failed sweep leaves the account whole and a re-run finishes', async () => {
    await seed();
    const real = (f.prisma as unknown as { medCycleEvent: { deleteMany: (a: never) => Promise<unknown> } })
      .medCycleEvent.deleteMany;
    let armed = true;
    (f.prisma as unknown as { medCycleEvent: Record<string, unknown> }).medCycleEvent.deleteMany = async (a: never) => {
      if (armed) {
        armed = false;
        throw new Error('injected');
      }
      return real(a);
    };
    await expect(anonymizeAccount('u1')).rejects.toThrow('injected');
    expect(mine('medTrackerCycle')).toHaveLength(2); // the erasure batch never ran
    expect(rmhEvents()).toHaveLength(4); // and the pre-step rolled back
    await anonymizeAccount('u1');
    expect(mine('medTrackerCycle')).toHaveLength(0);
    expect(rmhEvents()).toHaveLength(1);
    expect(await audit()).toEqual(ZERO);
  });

  it('without the server secret and with shared events it refuses, leaving the account scheduled; without events it succeeds', async () => {
    await seed();
    delete process.env.MEDSCHOOLS_DEDUPE_SECRET;
    await expect(anonymizeAccount('u1')).rejects.toBeInstanceOf(SharingUnavailableError);
    expect(mine('medTrackerCycle')).toHaveLength(2);
    expect(rmhEvents()).toHaveLength(4);

    // A member who never shared has no events to find, so no secret is needed.
    f.tables.user.push({ id: 'u3', createdAt: OLD, banReason: null, deletionScheduledAt: null });
    f.tables.medTrackerCycle.push({ id: 'c3', userId: 'u3', cycleYear: 2027, shareAnonymously: false });
    await anonymizeAccount('u3');
    expect(f.tables.medTrackerCycle.filter((c) => (c as { userId: string }).userId === 'u3')).toHaveLength(0);
  });
});

describe('Q&A limit requests (phase 6, R19)', () => {
  it("erases the member's requests, nulls the admin reference on others', and leaves other members' requests", async () => {
    await seed();
    f.tables.user.push({ id: 'adm', createdAt: OLD, banReason: null, deletionScheduledAt: null });
    const base = { note: '', adminNote: '', createdAt: OLD, decidedAt: null, decidedBy: null, revokedAt: null, revokedBy: null, revokeNote: '' };
    f.tables.medQaLimitRequest.push(
      { id: 'q1', userId: 'u1', status: 'APPROVED', ...base, note: 'for my MCAT prep', decidedBy: 'adm' },
      { id: 'q2', userId: 'u1', status: 'DECLINED', ...base },
      { id: 'q3', userId: 'u2', status: 'APPROVED', ...base, decidedBy: 'u1' },
      { id: 'q4', userId: 'u2', status: 'PENDING', ...base },
      // Approved by 'adm', revoked by the erased member: only the revoke reference goes.
      { id: 'q5', userId: 'u2', status: 'REVOKED', ...base, decidedBy: 'adm', revokedBy: 'u1', revokedAt: OLD },
    );
    await anonymizeAccount('u1');
    expect(f.tables.medQaLimitRequest.map((r) => (r as { id: string }).id)).toEqual(['q3', 'q4', 'q5']);
    expect(f.tables.medQaLimitRequest[0]).toMatchObject({ id: 'q3', decidedBy: null, status: 'APPROVED' });
    expect(f.tables.medQaLimitRequest[2]).toMatchObject({ id: 'q5', decidedBy: 'adm', revokedBy: null, status: 'REVOKED' });
  });
});

describe('scheduleDeletion', () => {
  it('removes the shared events at the request and switches sharing off (Q3)', async () => {
    await seed();
    await scheduleDeletion('u1', NOW);
    expect(rmhEvents()).toHaveLength(1);
    expect(
      f.tables.medTrackerCycle.filter(
        (c) =>
          (c as { userId: string; shareAnonymously: boolean }).userId === 'u1' &&
          (c as { shareAnonymously: boolean }).shareAnonymously,
      ),
    ).toHaveLength(0);
    expect(f.tables.medTrackerMilestone).toHaveLength(7); // the private tracker itself waits for finalisation
    expect(await audit()).toEqual(ZERO);
  });

  it('still schedules when the secret is unset, and logs; finalisation will refuse until it is back', async () => {
    await seed();
    delete process.env.MEDSCHOOLS_DEDUPE_SECRET;
    await expect(scheduleDeletion('u1', NOW)).resolves.toBeInstanceOf(Date);
    expect(console.error).toHaveBeenCalled();
    expect(rmhEvents()).toHaveLength(4);
  });
});

describe('applicant stats (phase D)', () => {
  const stats = putStatsBody.parse({
    mcat: [{ year: 2026, month: 4, total: 512 }],
    gpa: { cumulative: 3.81 },
    hours: [{ category: 'RESEARCH', hours: 1200, note: 'two labs', activities: [{ title: 'Lab A', hours: 700 }] }],
  });

  it("erases the member's stats and every child row, and leaves another member's", async () => {
    await seed();
    await putStats('u1', stats);
    await putStats('u2', stats);
    await anonymizeAccount('u1');
    const owners = (t: string, key: string) => f.tables[t]!.map((r) => (r as Record<string, unknown>)[key]);
    expect(owners('medApplicantProfile', 'userId')).toEqual(['u2']);
    expect(owners('medMcatAttempt', 'profileId')).toEqual(['u2']);
    expect(owners('medApplicantHours', 'profileId')).toEqual(['u2']);
    expect(owners('medApplicantActivity', 'profileId')).toEqual(['u2']);
  });

  it('the export carries the stats, with no ids', async () => {
    await seed();
    await putStats('u1', stats);
    const out = await exportMedschools('u1');
    expect(out.stats?.mcat.map((m) => m.total)).toEqual([512]);
    expect(out.stats?.hours[0]).toMatchObject({ category: 'RESEARCH', note: 'two labs' });
    expect(JSON.stringify(out.stats)).not.toMatch(/"(id|userId|profileId)"/);
    expect((await exportMedschools('u2')).stats).toBeNull();
  });
});

describe('the data export', () => {
  it("carries the member's tracker, lists and prefs, with no ids and never another member's rows", async () => {
    await seed();
    const out = await exportMedschools('u1');
    expect(out.tracker.map((c) => c.cycleYear)).toEqual([2027, 2026]);
    expect(out.tracker[0]).toMatchObject({ shareAnonymously: true });
    expect(out.tracker[0]!.applications.map((a) => a.school).sort()).toEqual(['school-x', 'school-y']);
    expect(out.tracker[0]!.applications.find((a) => a.school === 'school-x')!.milestones).toEqual([
      { type: 'SUBMITTED', date: '2026-06-20' },
      { type: 'INTERVIEW', date: '2026-11-18' },
    ]);
    expect(out.lists.map((l) => l.name)).toEqual(['My schools', 'Reach']);
    expect(out.lists[0]!.items).toEqual([{ school: 'school-x', program: null, note: null }]);
    expect(out.prefs).toMatchObject({ programFilter: 'PHD' });
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/"(id|userId|cycleId|applicationId|dedupeHash)"/);
    for (const e of f.tables.medCycleEvent) expect(text).not.toContain((e as { dedupeHash: string }).dedupeHash);
    const other = JSON.stringify(await exportMedschools('u2'));
    expect(other).not.toContain('Reach');
    expect((await exportMedschools('nobody')).tracker).toEqual([]);
    expect((await exportMedschools('nobody')).prefs).toEqual({
      programFilter: 'ALL',
      degree: null,
      homeState: null,
      chartCategories: [],
      programs: [],
    });
  });
});
