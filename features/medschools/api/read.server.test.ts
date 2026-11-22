import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    medSchoolStats: d(),
    medInterviewQuestion: d(),
    medInterviewProfile: d(),
    medSdnThread: d(),
    medSchoolAlias: d(),
    medCycle: d(),
  };
});
vi.mock('@/lib/prisma.server', () => ({ prisma: m }));

import { getActivity, getHistory, getLive, getSchool, getToday, listSchools } from './read.server';

const NOW = new Date('2027-11-21T00:30:00Z');
const school = {
  id: 's1',
  slug: 'duke',
  name: 'Duke',
  shortName: 'Duke',
  degree: 'MD',
  city: 'Durham',
  state: 'NC',
  website: null,
  interviewFormat: null,
  interviewType: null,
};
const d = (s: string) => new Date(`${s}T00:00:00Z`);

beforeEach(() => {
  for (const delegate of Object.values(m)) {
    delegate.findMany.mockReset().mockResolvedValue([]);
    delegate.groupBy.mockReset().mockResolvedValue([]);
    delegate.findFirst.mockReset().mockResolvedValue(null);
    delegate.findUnique.mockReset().mockResolvedValue(null);
    delegate.count.mockReset().mockResolvedValue(0);
  }
});

const FORBIDDEN = new Set(['inState', 'dedupeHash', 'ingestedAt', 'cursorPostHash', 'userId']);
function selectKeys(node: unknown, out: string[] = []): string[] {
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      out.push(k);
      selectKeys(v, out);
    }
  }
  return out;
}

describe('anonymity of queries', () => {
  it('every call selects explicitly and never a person-shaped field', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medSchool.findMany.mockResolvedValue([school]);
    await listSchools({}, NOW);
    await getSchool('duke', NOW);
    await getActivity('duke', {}, NOW);
    await getHistory('duke', {}, NOW);
    await getLive({}, NOW);
    await getToday({}, NOW);
    for (const [name, delegate] of Object.entries(m)) {
      for (const fn of [delegate.findMany, delegate.findFirst, delegate.findUnique]) {
        for (const [args] of fn.mock.calls) {
          const a = args as { select?: unknown };
          expect(a.select, `${name} read without select`).toBeTypeOf('object');
          expect(selectKeys(a.select).filter((k) => FORBIDDEN.has(k))).toEqual([]);
        }
      }
    }
  });
});

describe('getLive', () => {
  const row = (id: string, at: string, program: 'REG' | 'PHD' | null = 'REG') => ({
    id,
    eventType: 'INTERVIEW',
    program,
    source: 'ADMIT',
    occurredAt: new Date(at),
    school: { slug: 'duke', shortName: 'Duke', name: 'Duke' },
  });

  it('is public-source only, exact keys, minute-truncated, null program kept', async () => {
    m.medCycleEvent.findMany.mockResolvedValue([row('b', '2026-11-20T10:15:42.123Z', null)]);
    const res = await getLive({}, NOW);
    const args = m.medCycleEvent.findMany.mock.calls[0]![0] as { where: { source: unknown } };
    expect(args.where.source).toEqual({ in: ['ADMIT', 'SDN'] });
    const e = res.events[0]!;
    expect(e.program).toBeNull();
    expect(Object.keys(e).sort()).toEqual(['eventType', 'id', 'occurredAt', 'program', 'school', 'source']);
    expect(Object.keys(e.school).sort()).toEqual(['name', 'shortName', 'slug']);
    expect(e.occurredAt).toBe('2026-11-20T10:15:00.000Z');
  });

  it('pages ties on occurredAt without skipping or repeating', async () => {
    const all = ['e', 'd', 'c', 'b', 'a'].map((id) => row(id, '2026-11-20T10:15:00.000Z'));
    m.medCycleEvent.findMany.mockImplementation(async (...a: unknown[]) => {
      const { where, take } = a[0] as { where: { OR?: [unknown, { id: { lt: string } }] }; take: number };
      const lt = where.OR?.[1]?.id.lt;
      return all.filter((r) => lt === undefined || r.id < lt).slice(0, take);
    });
    const p1 = await getLive({ limit: 2 }, NOW);
    const p2 = await getLive({ limit: 2, cursor: p1.nextCursor! }, NOW);
    const p3 = await getLive({ limit: 2, cursor: p2.nextCursor! }, NOW);
    expect([...p1.events, ...p2.events, ...p3.events].map((e) => e.id)).toEqual(['e', 'd', 'c', 'b', 'a']);
    expect(p3.nextCursor).toBeNull();
  });

  it('ignores a degree that contradicts the filtered school', async () => {
    await getLive({ school: 'duke', degree: 'DO' }, NOW);
    const args = m.medCycleEvent.findMany.mock.calls[0]![0] as { where: { school: Record<string, unknown> } };
    expect(args.where.school).toEqual({ active: true, slug: 'duke' });
  });
});

describe('getActivity', () => {
  const c = (source: string, date: string, eventType: string, count: number, contributors: number | null = null) => ({
    source,
    date: d(date),
    eventType,
    count,
    contributors,
  });

  it('returns five types, sums REG+PHD within a source, floors RMH, never names RMH', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2027 });
    m.medCycleEvent.count.mockResolvedValue(4);
    m.medCycleCount.findMany.mockResolvedValue([
      c('ADMIT', '2026-11-10', 'INTERVIEW', 2),
      c('ADMIT', '2026-11-10', 'INTERVIEW', 3),
      c('SDN', '2026-11-10', 'INTERVIEW', 1),
      c('RMH', '2026-11-10', 'INTERVIEW', 9, 2),
    ]);
    const res = (await getActivity('duke', {}, NOW))!;
    expect(res.types.map((t) => t.eventType)).toEqual([
      'INTERVIEW',
      'SECONDARY',
      'WAITLIST',
      'REJECTION',
      'ACCEPTANCE',
    ]);
    const iv = res.types[0]!;
    expect(iv.primary).toBe('ADMIT');
    expect(iv.sources.map((s) => [s.source, s.total])).toEqual([
      ['ADMIT', 5],
      ['SDN', 1],
    ]);
    expect(res.unreportedProgram).toBe(4);
    expect(res.dayZeroEstimated).toBe(true);
    expect(JSON.stringify(res)).not.toContain('RMH');
    const args = m.medCycleCount.findMany.mock.calls[0]![0] as { where: { program: unknown } };
    expect(args.where.program).toEqual({ in: ['REG', 'PHD'] });
  });

  it('reads one program when asked and 404s unknown slugs', async () => {
    m.medSchool.findFirst.mockResolvedValueOnce(null);
    expect(await getActivity('nope', {}, NOW)).toBeNull();
    m.medSchool.findFirst.mockResolvedValue(school);
    await getActivity('duke', { program: 'PHD' }, NOW);
    const args = m.medCycleCount.findMany.mock.calls[0]![0] as { where: { program: unknown } };
    expect(args.where.program).toEqual({ in: ['PHD'] });
  });
});

describe('getHistory', () => {
  it('gives cumulative points by day of cycle, newest first, at most four', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleCount.findMany.mockResolvedValueOnce([{ cycleYear: 2027 }, { cycleYear: 2026 }]).mockResolvedValueOnce([
      {
        cycleYear: 2027,
        source: 'CYCLETRACK',
        date: d('2026-06-01'),
        eventType: 'INTERVIEW',
        count: 2,
        contributors: null,
      },
      {
        cycleYear: 2027,
        source: 'CYCLETRACK',
        date: d('2026-06-03'),
        eventType: 'INTERVIEW',
        count: 1,
        contributors: null,
      },
      {
        cycleYear: 2026,
        source: 'CYCLETRACK',
        date: d('2025-06-02'),
        eventType: 'INTERVIEW',
        count: 4,
        contributors: null,
      },
    ]);
    m.medCycle.findMany.mockResolvedValue([{ cycleYear: 2027, dayZeroOn: d('2026-06-01'), dateEstimated: false }]);
    const res = (await getHistory('duke', {}, NOW))!;
    const first = m.medCycleCount.findMany.mock.calls[0]![0] as { take: number };
    expect(first.take).toBe(4);
    expect(res.cycles.map((c) => c.cycleYear)).toEqual([2027, 2026]);
    expect(res.cycles[0]!.sources[0]!.points).toEqual([
      { day: 0, cumulative: 2 },
      { day: 2, cumulative: 3 },
    ]);
    expect(res.cycles[0]!.dayZeroEstimated).toBe(false);
    expect(res.cycles[1]!.dayZeroEstimated).toBe(true);
  });
});

describe('getSchool', () => {
  const stat = (residence: string, contributors: number | null) => ({
    source: 'CYCLETRACK',
    program: null,
    cycleYear: 2027,
    residence,
    contributors,
    gpaMedian: 3.9,
    gpaLow: null,
    gpaHigh: null,
    mcatMedian: null,
    mcatLow: null,
    mcatHigh: null,
    interviewToAcceptancePct: null,
    applicationToInterviewPct: null,
    applicationCount: null,
    interviewCount: null,
    admittedCount: null,
    researchHours: null,
    clinicalHours: null,
    nonClinicalHours: null,
  });
  const profile = (i: number | null, o: number | null) => ({
    source: 'ADMIT',
    format: null,
    fileType: null,
    avgDifficulty: null,
    avgStress: null,
    avgImpression: null,
    interviewCount: null,
    interviewStyle: null,
    interviewLength: null,
    inStateCount: i,
    outOfStateCount: o,
    feedbackPositive: Array.from({ length: 15 }, (_, n) => `p${n}`),
    feedbackNegative: [],
    feedbackBefore: [],
  });

  it('drops thin in-state rows, floors the split, caps feedback and questions', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2027 });
    m.medCycleCount.findMany.mockResolvedValue([{ program: 'REG' }]);
    m.medSchoolStats.findMany.mockResolvedValue([
      stat('GLOBAL', null),
      stat('IN_STATE', 2),
      stat('IN_STATE', null),
      stat('OUT_OF_STATE', 3),
    ]);
    m.medInterviewProfile.findMany.mockResolvedValue([profile(5, 2), profile(5, 3)]);
    m.medInterviewQuestion.findMany.mockResolvedValue(
      Array.from({ length: 130 }, (_, n) => ({ text: `q${n}`, source: 'SDN', votes: null, cycleYear: null })),
    );
    const res = (await getSchool('duke', NOW))!;
    expect(res.stats.map((s) => s.residence)).toEqual(['GLOBAL', 'OUT_OF_STATE']);
    expect(res.profiles.map((p) => p.split)).toEqual([null, { inState: 5, outOfState: 3 }]);
    expect(res.profiles[0]!.feedbackPositive).toHaveLength(10);
    expect(res.questions).toHaveLength(100);
    expect(res.school.degree).toBe('MD');
    expect(res.programsWithData).toEqual(['REG']);
  });

  it('returns null for an unknown or inactive slug', async () => {
    m.medSchool.findFirst.mockResolvedValue(null);
    expect(await getSchool('nope', NOW)).toBeNull();
    expect((m.medSchool.findFirst.mock.calls[0]![0] as { where: { active: boolean } }).where.active).toBe(true);
  });
});

describe('listSchools', () => {
  it('filters, lists distinct sorted states, picks the primary reported count', async () => {
    m.medSchool.findMany.mockResolvedValue([
      school,
      { ...school, id: 's2', slug: 'tx', name: 'Texas', shortName: 'TX', degree: 'DO', state: 'TX' },
    ]);
    m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2027 });
    m.medCycleCount.groupBy.mockResolvedValue([
      { schoolId: 's1', source: 'SDN', _sum: { count: 3 } },
      { schoolId: 's1', source: 'ADMIT', _sum: { count: 7 } },
    ]);
    const res = await listSchools({ degree: 'MD', q: '([' }, NOW);
    expect(res.schools).toEqual([]);
    const ok = await listSchools({ degree: 'MD' }, NOW);
    expect(ok.states).toEqual(['NC', 'TX']);
    expect(ok.schools.map((s) => [s.slug, s.reported])).toEqual([['duke', { source: 'ADMIT', count: 7 }]]);
    expect(ok.program).toBe('ALL');
  });
});

describe('getToday', () => {
  it('says whether the latest day is today', async () => {
    m.medCycleCount.findFirst
      .mockResolvedValueOnce({ cycleYear: 2027 })
      .mockResolvedValueOnce({ date: d('2027-11-20') });
    m.medCycleCount.findMany.mockResolvedValue([
      {
        schoolId: 's1',
        source: 'SDN',
        count: 1,
        school: { slug: 'duke', shortName: 'Duke', name: 'Duke', state: 'NC' },
      },
      {
        schoolId: 's1',
        source: 'ADMIT',
        count: 4,
        school: { slug: 'duke', shortName: 'Duke', name: 'Duke', state: 'NC' },
      },
    ]);
    const res = await getToday({}, NOW);
    expect(res).toMatchObject({ date: '2027-11-20', isToday: false });
    expect(res.schools).toEqual([
      { slug: 'duke', shortName: 'Duke', name: 'Duke', state: 'NC', count: 4, source: 'ADMIT' },
    ]);
  });

  it('is empty with no interview counts', async () => {
    const res = await getToday({}, NOW);
    expect(res).toMatchObject({ date: null, schools: [] });
  });
});
