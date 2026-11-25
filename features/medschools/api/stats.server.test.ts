import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from '../scrape/test-support';
import { putStatsBody } from './stats-schemas';

const fake = vi.hoisted(() => ({ current: null as null | { prisma: unknown } }));
vi.mock('@/lib/prisma.server', () => ({
  get prisma() {
    return fake.current?.prisma;
  },
}));

import { clearStats, getStats, putStats, skipOnboarding, statsForBuilder } from './stats.server';

let f: ReturnType<typeof createFakePrisma>;
beforeEach(() => {
  f = createFakePrisma();
  fake.current = f;
});

const body = (v: unknown) => {
  const r = putStatsBody.safeParse(v);
  if (!r.success) throw new Error(r.error.message);
  return r.data;
};

const FULL = body({
  mcat: [
    { year: 2025, month: 8, total: 505 },
    { year: 2026, month: 4, day: 12, cpbs: 128, cars: 127, bbls: 129, psbb: 128 },
  ],
  gpa: { cumulative: 3.81, science: 3.72 },
  hours: [
    { category: 'RESEARCH', hours: 1200, note: 'Two labs', activities: [{ title: 'Lab A', hours: 700, note: 'PI' }] },
    { category: 'SHADOWING', hours: 40 },
  ],
  homeState: 'TX',
  missions: ['research'],
  publications: 2,
});

describe('stats (private)', () => {
  it('no row: stats null, onboarding pending, nothing created', async () => {
    expect(await getStats('a')).toEqual({ stats: null, onboarding: 'pending', homeState: null });
    expect(f.tables.medApplicantProfile).toHaveLength(0);
  });

  it('round trips, replaces on a second save, and writes the home state to the preferences', async () => {
    const r = await putStats('a', FULL);
    expect(r.onboarding).toBe('done');
    expect(r.homeState).toBe('TX');
    expect(r.stats?.mcat.map((m) => m.total)).toEqual([505, 512]);
    expect(r.stats?.hours).toEqual([
      { category: 'RESEARCH', hours: 1200, note: 'Two labs', activities: [{ title: 'Lab A', hours: 700, note: 'PI' }] },
      { category: 'SHADOWING', hours: 40, note: null, activities: [] },
    ]);
    expect(f.tables.medUserPrefs).toEqual([expect.objectContaining({ userId: 'a', homeState: 'TX' })]);

    const again = await putStats('a', body({ gpa: { cumulative: 3.9 } }));
    expect(again.stats?.mcat).toEqual([]);
    expect(again.stats?.hours).toEqual([]);
    expect(again.stats?.gpa.cumulative).toBe(3.9);
    expect(again.homeState).toBe('TX'); // absent leaves the preference alone
    expect(f.tables.medMcatAttempt).toHaveLength(0);
    expect(f.tables.medApplicantActivity).toHaveLength(0);
  });

  it('one member never sees or changes another’s', async () => {
    await putStats('a', FULL);
    expect((await getStats('b')).stats).toBeNull();
    await putStats('b', body({ publications: 1 }));
    expect((await getStats('a')).stats?.publications).toBe(2);
    await clearStats('b');
    expect((await getStats('a')).stats?.mcat).toHaveLength(2);
  });

  it('skip is remembered; clear removes the stats and keeps onboarding done', async () => {
    expect((await skipOnboarding('a')).onboarding).toBe('done');
    expect((await getStats('a')).onboarding).toBe('done');
    await putStats('a', FULL);
    const cleared = await clearStats('a');
    expect(cleared.onboarding).toBe('done');
    expect(cleared.stats?.mcat).toEqual([]);
    expect(cleared.stats?.gpa.cumulative).toBeNull();
    expect(f.tables.medMcatAttempt).toHaveLength(0);
    expect(f.tables.medApplicantHours).toHaveLength(0);
  });

  it('every write takes the member’s stats lock', async () => {
    await putStats('a', FULL);
    expect(f.lockLog.at(-1)).toEqual(['med-stats:a']);
  });

  it('the builder gets figures only: the latest MCAT total (and earlier totals for the labels), GPAs, home state, hour totals, missions; no note or title', async () => {
    await putStats('a', FULL);
    const s = await statsForBuilder('a');
    expect(s).toEqual({
      mcat: { total: 512, year: 2026, month: 4, earlier: [505] },
      gpaCumulative: 3.81,
      gpaScience: 3.72,
      homeState: 'TX',
      hours: [
        { category: 'RESEARCH', hours: 1200 },
        { category: 'SHADOWING', hours: 40 },
      ],
      missions: ['research'],
    });
    expect(JSON.stringify(s)).not.toMatch(/Two labs|Lab A|PI/);
    expect(await statsForBuilder('nobody')).toBeNull();
  });
});
