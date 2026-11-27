import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The reader's CycleTrack / Admit.org choice on the public reads (owner 2026-11-24): `source=` picks which ONE source's
 * figure is the total and the primary series, falls back to the other then the primary order, and never sums sources.
 */
const m = vi.hoisted(() => {
  const d = () => ({
    findMany: vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []),
    findFirst: vi.fn(async (..._a: unknown[]): Promise<unknown> => null),
    findUnique: vi.fn(async (..._a: unknown[]): Promise<unknown> => null),
    count: vi.fn(async (..._a: unknown[]): Promise<number> => 0),
    groupBy: vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []),
  });
  return {
    medSchool: d(),
    medCycleCount: d(),
    medCycleEvent: d(),
    medAdmitCycleTotal: d(),
    medCycle: d(),
    $queryRaw: vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []),
  };
});
vi.mock('@/lib/prisma.server', () => ({ prisma: m }));

import { activityQuery, arrivalsQuery, forecastQuery, listSchoolsQuery } from './read-schemas';
import { getActivity, listSchools } from './read.server';

const NOW = new Date('2027-11-21T00:30:00Z');
const school = { id: 's1', slug: 'duke', name: 'Duke', shortName: 'Duke', degree: 'MD', city: 'Durham', state: 'NC' };
const d = (s: string) => new Date(`${s}T00:00:00Z`);

beforeEach(() => {
  for (const x of Object.values(m)) {
    if (typeof x === 'function') continue;
    x.findMany.mockReset().mockResolvedValue([]);
    x.findFirst.mockReset().mockResolvedValue(null);
    x.findUnique.mockReset().mockResolvedValue(null);
    x.count.mockReset().mockResolvedValue(0);
    x.groupBy.mockReset().mockResolvedValue([]);
  }
  m.$queryRaw.mockReset().mockResolvedValue([]);
  m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2027 });
});

describe('the source param (validation)', () => {
  it('takes cycletrack or admit on the list and the activity read', () => {
    for (const schema of [listSchoolsQuery, activityQuery, forecastQuery]) {
      expect(schema.safeParse({ source: 'cycletrack' }).success).toBe(true);
      expect(schema.safeParse({ source: 'admit' }).success).toBe(true);
      expect(schema.safeParse({}).success).toBe(true);
    }
  });
  it('refuses anything else (a 400 through implement): other sources, upper case, junk', () => {
    for (const schema of [listSchoolsQuery, activityQuery, forecastQuery]) {
      for (const bad of ['sdn', 'rmh', 'ADMIT', 'Admit', 'admit.org', 'cycletrack,admit', '', 'x'.repeat(100)])
        expect(schema.safeParse({ source: bad }).success, bad).toBe(false);
    }
  });
  it('the arrivals read takes no source (its schema is the history one)', () => {
    expect(arrivalsQuery.safeParse({ source: 'admit' }).data).toEqual({});
  });
});

describe('listSchools: reported follows the choice, one source only', () => {
  beforeEach(() => {
    m.medSchool.findMany.mockResolvedValue([
      school,
      { ...school, id: 's2', slug: 'ct-only', name: 'CT only' },
      { ...school, id: 's3', slug: 'sdn-only', name: 'SDN only' },
    ]);
    m.medCycleCount.groupBy.mockResolvedValue([
      { schoolId: 's1', source: 'CYCLETRACK', program: 'REG', _sum: { count: 40 } },
      { schoolId: 's1', source: 'ADMIT', program: 'REG', _sum: { count: 25 } },
      { schoolId: 's1', source: 'ADMIT', program: 'PHD', _sum: { count: 2 } },
      { schoolId: 's1', source: 'SDN', program: 'REG', _sum: { count: 9 } },
      { schoolId: 's2', source: 'CYCLETRACK', program: 'REG', _sum: { count: 11 } },
      { schoolId: 's3', source: 'SDN', program: 'REG', _sum: { count: 4 } },
    ]);
  });
  const reported = async (source?: 'cycletrack' | 'admit') =>
    Object.fromEntries(
      (await listSchools(source ? { source } : {}, NOW)).schools.map((s) => [s.slug, s.reported] as const),
    );

  it('defaults to the primary order (CycleTrack first), and cycletrack reads the same', async () => {
    const plain = await reported();
    expect(plain.duke).toEqual({ source: 'CYCLETRACK', count: 40 });
    expect(await reported('cycletrack')).toEqual(plain);
  });
  it('admit takes Admit.org where present (REG + PHD within Admit), never adding CycleTrack or SDN', async () => {
    const r = await reported('admit');
    expect(r.duke).toEqual({ source: 'ADMIT', count: 27 });
    // Falls back to the other source, then the existing order.
    expect(r['ct-only']).toEqual({ source: 'CYCLETRACK', count: 11 });
    expect(r['sdn-only']).toEqual({ source: 'SDN', count: 4 });
  });
});

describe('getActivity: the chosen source is primary where it has data', () => {
  const c = (source: string, date: string, eventType: string, count: number) => ({
    source,
    date: d(date),
    program: 'REG',
    eventType,
    count,
    contributors: null,
    publishedCount: null,
    publishedContributors: null,
  });
  beforeEach(() => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleCount.findMany.mockResolvedValue([
      c('CYCLETRACK', '2026-10-01', 'INTERVIEW', 5),
      c('ADMIT', '2026-10-01', 'INTERVIEW', 3),
      c('ADMIT', '2026-10-02', 'INTERVIEW', 1),
      c('CYCLETRACK', '2026-10-03', 'REJECTION', 2),
    ]);
  });

  it('keeps every source as a series and moves only the primary', async () => {
    const plain = (await getActivity('duke', {}, NOW))!;
    const admit = (await getActivity('duke', { source: 'admit' }, NOW))!;
    const iv = (r: typeof plain) => r.types.find((t) => t.eventType === 'INTERVIEW')!;
    expect(iv(plain).primary).toBe('CYCLETRACK');
    expect(iv(admit).primary).toBe('ADMIT');
    // Same series, same totals: the choice never sums or drops a source.
    expect(iv(admit).sources).toEqual(iv(plain).sources);
    expect(iv(admit).sources.map((s) => [s.source, s.total])).toEqual([
      ['CYCLETRACK', 5],
      ['ADMIT', 4],
    ]);
    // A category Admit has nothing for falls back to the other source.
    expect(admit.types.find((t) => t.eventType === 'REJECTION')!.primary).toBe('CYCLETRACK');
  });
  it('answers with the same key set either way', async () => {
    const plain = (await getActivity('duke', {}, NOW))!;
    const admit = (await getActivity('duke', { source: 'admit' }, NOW))!;
    expect(Object.keys(admit).sort()).toEqual(Object.keys(plain).sort());
  });
});
