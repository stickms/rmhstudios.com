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
    medForecast: d(),
    medSchoolFact: d(),
    $queryRaw: vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []),
  };
});
vi.mock('@/lib/prisma.server', () => ({ prisma: m }));
type Delegate = typeof m.medSchool;

import {
  getActivity,
  getArrivals,
  getCardData,
  getForecast,
  getHistory,
  getLive,
  getSchool,
  getToday,
  listSchools,
} from './read.server';

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
// The k floor plus Q2: an RMH cell is public through its daily snapshot only, needs 3 published contributors AND a date
// before today UTC (NOW is 2027-11-21). The live `contributors` never gates a public read.
const FLOOR = {
  OR: [{ source: { not: 'RMH' } }, { source: 'RMH', publishedContributors: { gte: 3 }, date: { lt: d('2027-11-21') } }],
};

beforeEach(() => {
  m.$queryRaw.mockReset().mockResolvedValue([]);
  for (const delegate of Object.values(m).filter((x) => 'findMany' in x) as Delegate[]) {
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
    await getForecast('duke', {}, NOW);
    await getLive({}, NOW);
    await getToday({}, NOW);
    for (const [name, delegate] of Object.entries(m).filter(([, x]) => 'findMany' in x) as [string, Delegate][]) {
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
    school: { slug: 'duke', shortName: 'Duke', name: 'Duke', degree: 'MD', city: 'Durham', state: 'NC' },
  });

  it('is public-source only, exact keys, minute-truncated, null program kept', async () => {
    m.medCycleEvent.findMany.mockResolvedValue([row('b', '2026-11-20T10:15:42.123Z', null)]);
    const res = await getLive({}, NOW);
    const args = m.medCycleEvent.findMany.mock.calls[0]![0] as { where: { source: unknown } };
    expect(args.where.source).toEqual({ in: ['ADMIT', 'SDN'] });
    const e = res.events[0]!;
    expect(e.program).toBeNull();
    expect(Object.keys(e).sort()).toEqual(['eventType', 'id', 'occurredAt', 'program', 'school', 'source', 'wave']);
    expect(Object.keys(e.school).sort()).toEqual(['city', 'degree', 'name', 'shortName', 'slug', 'state']);
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
    const at = new Date('2026-11-20T10:15:00.000Z');
    const second = m.medCycleEvent.findMany.mock.calls[1]![0] as { where: { OR: unknown } };
    expect(second.where.OR).toEqual([{ occurredAt: { lt: at } }, { occurredAt: { equals: at }, id: { lt: 'd' } }]);
    expect(p3.nextCursor).toBeNull();
  });

  it('ignores a degree that contradicts the filtered school', async () => {
    await getLive({ school: 'duke', degree: 'DO' }, NOW);
    const args = m.medCycleEvent.findMany.mock.calls[0]![0] as { where: { school: Record<string, unknown> } };
    expect(args.where.school).toEqual({ active: true, slug: 'duke' });
  });
});

describe('getActivity', () => {
  // An RMH row's published figures mirror the live ones unless a test says otherwise (`published`).
  const c = (
    source: string,
    date: string,
    eventType: string,
    count: number,
    contributors: number | null = null,
    published?: { count: number | null; contributors: number | null },
  ) => ({
    source,
    date: d(date),
    eventType,
    count,
    contributors,
    publishedCount: source === 'RMH' ? (published ? published.count : count) : null,
    publishedContributors: source === 'RMH' ? (published ? published.contributors : contributors) : null,
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
    expect(res.unreportedProgramSource).toBe('ADMIT');
    expect(res.dayZeroEstimated).toBe(true);
    expect(JSON.stringify(res)).not.toContain('RMH');
    const args = m.medCycleCount.findMany.mock.calls[0]![0] as { where: { program: unknown } };
    expect(args.where.program).toEqual({ in: ['REG', 'PHD'] });
  });

  it('counts unreported-program events for one source only, charted types only', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleEvent.count.mockResolvedValueOnce(3).mockResolvedValueOnce(5);
    const res = (await getActivity('duke', {}, NOW))!;
    expect([res.unreportedProgram, res.unreportedProgramSource]).toEqual([3, 'ADMIT']);
    expect(m.medCycleEvent.count).toHaveBeenCalledTimes(1);
    const w = (m.medCycleEvent.count.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(w).toMatchObject({
      program: null,
      source: 'ADMIT',
      eventType: { in: ['INTERVIEW', 'SECONDARY', 'WAITLIST', 'REJECTION', 'ACCEPTANCE'] },
    });

    m.medCycleEvent.count.mockReset().mockResolvedValueOnce(0).mockResolvedValueOnce(5);
    const sdn = (await getActivity('duke', {}, NOW))!;
    expect([sdn.unreportedProgram, sdn.unreportedProgramSource]).toEqual([5, 'SDN']);
    m.medCycleEvent.count.mockReset().mockResolvedValue(0);
    const none = (await getActivity('duke', {}, NOW))!;
    expect([none.unreportedProgram, none.unreportedProgramSource]).toEqual([0, null]);
  });

  it('floors each RMH row before summing programs', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleCount.findMany.mockResolvedValue([
      c('RMH', '2026-11-10', 'INTERVIEW', 2, 2),
      c('RMH', '2026-11-10', 'INTERVIEW', 2, 2),
      c('RMH', '2026-11-11', 'INTERVIEW', 4, 3),
      c('RMH', '2026-11-11', 'INTERVIEW', 6, 4),
    ]);
    const iv = (await getActivity('duke', {}, NOW))!.types[0]!;
    // 2+2 contributors sums to 4 but each row is under the floor, so 2026-11-10 is absent; 3 and 4 survive and add.
    expect(iv.sources).toEqual([{ source: 'RMH', days: [{ date: '2026-11-11', count: 10 }], total: 10 }]);
  });

  it("holds back today's RMH cells (Q2): today and later are dropped, yesterday is kept, other sources are not held", async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleCount.findMany.mockResolvedValue([
      c('RMH', '2027-11-20', 'INTERVIEW', 5, 5), // yesterday (UTC): shown
      c('RMH', '2027-11-21', 'INTERVIEW', 6, 6), // today (UTC): held back
      c('RMH', '2027-11-22', 'INTERVIEW', 7, 7), // tomorrow (a milestone may be dated a day ahead): held back
      c('ADMIT', '2027-11-21', 'INTERVIEW', 2, null), // another source's today stays
    ]);
    const iv = (await getActivity('duke', {}, NOW))!.types[0]!;
    const rmh = iv.sources.find((s) => s.source === 'RMH');
    expect(rmh?.days).toEqual([{ date: '2027-11-20', count: 5 }]);
    expect(iv.sources.find((s) => s.source === 'ADMIT')?.days).toEqual([{ date: '2027-11-21', count: 2 }]);
    // One minute into the next UTC day the held-back cell is public.
    const next = (await getActivity('duke', {}, new Date('2027-11-22T00:01:00Z')))!.types[0]!;
    expect(next.sources.find((s) => s.source === 'RMH')?.days.map((x) => x.date)).toEqual(['2027-11-20', '2027-11-21']);
  });

  it('an RMH figure is the published one: live counts never show, and a row never published is absent (Q2 snapshot)', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleCount.findMany.mockResolvedValue([
      // Live 9 on 5 (someone just back-dated milestones into this cell), published still 3 on 3: the public sees 3.
      c('RMH', '2027-11-18', 'INTERVIEW', 9, 5, { count: 3, contributors: 3 }),
      // Live now 3, published 2 on 2: under the floor, hidden.
      c('RMH', '2027-11-19', 'INTERVIEW', 3, 3, { count: 2, contributors: 2 }),
      // Never published (created since the last snapshot): absent whatever the live count.
      c('RMH', '2027-11-17', 'INTERVIEW', 50, 50, { count: null, contributors: null }),
    ]);
    const iv = (await getActivity('duke', {}, NOW))!.types[0]!;
    expect(iv.sources).toEqual([{ source: 'RMH', days: [{ date: '2027-11-18', count: 3 }], total: 3 }]);
  });

  it('history reads the published figure too', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleCount.findMany.mockResolvedValueOnce([{ cycleYear: 2027 }]).mockResolvedValueOnce([
      { cycleYear: 2027, ...c('RMH', '2027-11-18', 'INTERVIEW', 9, 5, { count: 4, contributors: 4 }) },
      { cycleYear: 2027, ...c('RMH', '2027-11-19', 'INTERVIEW', 8, 8, { count: null, contributors: null }) },
    ]);
    const res = (await getHistory('duke', {}, NOW))!;
    expect(res.cycles[0]!.sources).toEqual([{ source: 'RMH', points: expect.any(Array), total: 4 }]);
  });

  it('reads one program when asked and 404s unknown slugs', async () => {
    m.medSchool.findFirst.mockResolvedValueOnce(null);
    expect(await getActivity('nope', {}, NOW)).toBeNull();
    m.medSchool.findFirst.mockResolvedValue(school);
    await getActivity('duke', { program: 'PHD' }, NOW);
    const args = m.medCycleCount.findMany.mock.calls[0]![0] as { where: { program: unknown } };
    // Both programs are read whatever the page shows (waves follow REG + PHD, D10); the chart filters to PHD afterwards.
    expect(args.where.program).toEqual({ in: ['REG', 'PHD'] });
  });
});

describe('the cycle is resolved once, site-wide', () => {
  it("getActivity, getSchool and getCardData never look up the school's own newest cycle", async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    // Site-wide latest INTERVIEW row is 2027; this school has nothing in 2027 (only older cycles).
    m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2027 });
    await getActivity('duke', {}, NOW);
    await getSchool('duke', NOW);
    await getCardData('duke', NOW);
    for (const [args] of m.medCycleCount.findFirst.mock.calls) {
      const w = (args as { where: Record<string, unknown> }).where;
      expect(w).not.toHaveProperty('schoolId');
      expect(w).toMatchObject({ eventType: 'INTERVIEW' });
    }
    const act = m.medCycleCount.findMany.mock.calls[0]![0] as { where: { cycleYear: number } };
    expect(act.where.cycleYear).toBe(2027);
    expect((await getActivity('duke', {}, NOW))!.cycleYear).toBe(2027);
  });

  it('an explicit cycle wins, and a June interview row of Y is not hidden by a Y+1 secondary', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2027 });
    expect((await getActivity('duke', { cycle: 2025 }, NOW))!.cycleYear).toBe(2025);
    // 2027-06-15: the rollover says 2028, but the newest INTERVIEW data is 2027.
    expect((await getActivity('duke', {}, new Date('2027-06-15T00:00:00Z')))!.cycleYear).toBe(2027);
  });
});

describe('getActivity other totals', () => {
  it('totals withdrawn and hold per source, floored, and never charts them', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    const row = (source: string, eventType: string, count: number, contributors: number | null = null) => ({
      source,
      date: d('2026-11-10'),
      eventType,
      count,
      contributors,
      publishedCount: source === 'RMH' ? count : null,
      publishedContributors: source === 'RMH' ? contributors : null,
    });
    m.medCycleCount.findMany.mockResolvedValue([
      row('ADMIT', 'WITHDRAWN', 2),
      row('ADMIT', 'WITHDRAWN', 3),
      row('RMH', 'HOLD', 4, 2),
      row('SDN', 'HOLD', 1),
    ]);
    const res = (await getActivity('duke', {}, NOW))!;
    expect(res.otherTotals).toEqual([
      { eventType: 'WITHDRAWN', sources: [{ source: 'ADMIT', total: 5 }] },
      { eventType: 'HOLD', sources: [{ source: 'SDN', total: 1 }] },
    ]);
    expect(res.types.map((t) => t.eventType)).not.toContain('WITHDRAWN');
    const w = (m.medCycleCount.findMany.mock.calls[0]![0] as { where: { eventType: { in: string[] } } }).where;
    expect(w.eventType.in).toEqual(expect.arrayContaining(['WITHDRAWN', 'HOLD']));
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
    expect(res.stats.every((x) => x.allCycles === false)).toBe(true);
    expect(res.programsWithData).toEqual(['REG']);
  });

  it('marks ADMIT stats as spanning all cycles', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2027 });
    m.medSchoolStats.findMany.mockResolvedValue([{ ...stat('GLOBAL', null), source: 'ADMIT' }, stat('GLOBAL', null)]);
    const res = (await getSchool('duke', NOW))!;
    expect(res.stats.map((x) => [x.source, x.allCycles])).toEqual([
      ['ADMIT', true],
      ['CYCLETRACK', false],
    ]);
  });

  it('reads the newest ADMIT stats per program and residence whatever cycle they carry', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2027 });
    const a = (cycleYear: number, gpa: number) => ({
      ...stat('GLOBAL', null),
      source: 'ADMIT',
      cycleYear,
      gpaMedian: gpa,
    });
    // Prisma returns them ordered cycleYear desc; the 2025 row is stale, the 2026 ADMIT row stands in for 2027.
    m.medSchoolStats.findMany.mockResolvedValue([
      a(2026, 3.8),
      a(2025, 3.5),
      { ...stat('GLOBAL', null), cycleYear: 2026 },
    ]);
    const res = (await getSchool('duke', NOW))!;
    expect(res.stats.map((x) => [x.source, x.cycleYear, x.gpaMedian])).toEqual([['ADMIT', 2026, 3.8]]);
    const args = m.medSchoolStats.findMany.mock.calls[0]![0] as { where: { OR: unknown[] }; orderBy: unknown };
    expect(args.where.OR).toEqual([{ cycleYear: 2027 }, { source: 'ADMIT' }]);
    expect(args.orderBy).toEqual({ cycleYear: 'desc' });
  });

  it('floors programsWithData and the latest-cycle lookup', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    await getSchool('duke', NOW);
    const latest = m.medCycleCount.findFirst.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(latest.where).toMatchObject(FLOOR);
    const progs = m.medCycleCount.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(progs.where).toMatchObject(FLOOR);
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

  it("carries each school's newest public event: the live feed's sources only, the list's program set, a day-only flag", async () => {
    m.medSchool.findMany.mockResolvedValue([school]);
    m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2027 });
    m.medCycleCount.groupBy.mockResolvedValue([]);
    m.$queryRaw.mockResolvedValue([
      { schoolId: 's1', eventType: 'INTERVIEW', occurredAt: new Date('2026-11-24T13:07:42.123Z') },
    ]);
    const res = await listSchools({}, NOW);
    expect(res.schools[0]!.latest).toEqual({
      eventType: 'INTERVIEW',
      occurredAt: '2026-11-24T13:07:00.000Z',
      dayOnly: false,
    });
    const call = m.$queryRaw.mock.calls.at(-1)! as unknown as [TemplateStringsArray, ...unknown[]];
    const sql = call[0].join('?');
    expect(sql).toContain(`"source" IN ('ADMIT'::"MedSource", 'SDN'::"MedSource")`);
    expect(sql).not.toContain('RMH');
    expect(sql).toContain('DISTINCT ON');
    // Every program on: no program filter (`true`); a set: its (program, degree) pairs.
    expect(call).toContain(true);
    await listSchools({ programs: 'md' }, NOW);
    const narrowed = m.$queryRaw.mock.calls.at(-1)! as unknown as unknown[];
    expect(narrowed).toContainEqual(['REG:MD']);

    m.$queryRaw.mockResolvedValue([
      { schoolId: 's1', eventType: 'ACCEPTANCE', occurredAt: new Date('2026-11-20T00:00:00.000Z') },
    ]);
    expect((await listSchools({}, NOW)).schools[0]!.latest?.dayOnly).toBe(true);
    m.$queryRaw.mockResolvedValue([]);
    expect((await listSchools({}, NOW)).schools[0]!.latest).toBeNull();
  });
});

describe('the program set on the list and the live feed (owner 2026-11-23)', () => {
  const doSchool = { ...school, id: 's2', slug: 'tx', name: 'Texas', shortName: 'TX', degree: 'DO', state: 'TX' };

  it("lists only schools of the set's degrees and counts only the set's programs of each school's own degree", async () => {
    m.medSchool.findMany.mockResolvedValue([school, doSchool]);
    m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2027 });
    m.medCycleCount.groupBy.mockResolvedValue([
      { schoolId: 's1', source: 'ADMIT', program: 'REG', _sum: { count: 5 } },
      { schoolId: 's1', source: 'ADMIT', program: 'PHD', _sum: { count: 2 } },
      { schoolId: 's2', source: 'ADMIT', program: 'PHD', _sum: { count: 9 } },
    ]);
    const mdPhd = await listSchools({ programs: 'md-phd,do' }, NOW);
    expect(mdPhd.schools.map((x) => [x.slug, x.reported?.count ?? null])).toEqual([
      ['duke', 2],
      ['tx', null],
    ]);
    const doOnly = await listSchools({ programs: 'do-phd' }, NOW);
    expect(doOnly.schools.map((x) => [x.slug, x.reported?.count])).toEqual([['tx', 9]]);
    const grouped = m.medCycleCount.groupBy.mock.calls[0]![0] as { where: { program: { in: string[] } } };
    expect([...grouped.where.program.in].sort()).toEqual(['PHD', 'REG']);
  });

  it('the older degree and program parameters mean the same set', async () => {
    m.medSchool.findMany.mockResolvedValue([school, doSchool]);
    m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2027 });
    expect((await listSchools({ degree: 'DO' }, NOW)).schools.map((x) => x.slug)).toEqual(['tx']);
    expect((await listSchools({ program: 'PHD' }, NOW)).program).toBe('PHD');
  });

  it('the live feed filters by (degree, program) pairs and drops unreported programs unless every program is on', async () => {
    await getLive({ programs: 'md,do-phd' }, NOW);
    const sub = m.medCycleEvent.findMany.mock.calls[0]![0] as { where: { AND?: unknown[]; program?: unknown } };
    expect(sub.where.AND).toEqual([
      {
        OR: [
          { program: 'REG', school: { degree: 'MD' } },
          { program: 'PHD', school: { degree: 'DO' } },
        ],
      },
    ]);
    await getLive({ programs: 'md,md-phd,do,do-phd' }, NOW);
    const all = m.medCycleEvent.findMany.mock.calls[1]![0] as { where: { AND?: unknown[]; program?: unknown } };
    expect(all.where.AND).toBeUndefined();
    expect(all.where.program).toBeUndefined();
  });

  it('filters several states at once, deduped and sorted', async () => {
    await getLive({ state: 'TX,NC,TX' }, NOW);
    const a = m.medCycleEvent.findMany.mock.calls[0]![0] as { where: { school: unknown } };
    expect(a.where.school).toEqual({ active: true, state: { in: ['NC', 'TX'] } });
  });

  it('searches any name a school is known by (the index matcher), an exact state code; filters state and types', async () => {
    m.medSchool.findMany.mockResolvedValue([
      { id: 's-duke', name: 'Duke University', shortName: 'Duke', aliases: [] },
      {
        id: 's-usc',
        name: 'University of Southern California',
        shortName: 'USC',
        aliases: [{ sourceKey: 'keck-school-of-medicine-of-the-university-of-southern-california' }],
      },
    ]);
    await getLive({ q: 'Duk', state: 'NC', types: 'acceptance,rejection' }, NOW);
    const a = m.medCycleEvent.findMany.mock.calls[0]![0] as {
      where: { eventType: unknown; school: unknown; AND: unknown[] };
    };
    expect(a.where.eventType).toEqual({ in: ['ACCEPTANCE', 'REJECTION'] });
    expect(a.where.school).toEqual({ active: true, state: { in: ['NC'] } });
    expect(a.where.AND).toEqual([
      {
        school: {
          OR: [{ id: { in: ['s-duke'] } }],
        },
      },
    ]);
    await getLive({ q: 'Keck' }, NOW);
    const k = m.medCycleEvent.findMany.mock.calls[1]![0] as { where: { AND: { school: { OR: unknown[] } }[] } };
    expect(k.where.AND[0]!.school.OR).toEqual([{ id: { in: ['s-usc'] } }]);
    await getLive({ q: 'nc' }, NOW);
    const b = m.medCycleEvent.findMany.mock.calls[2]![0] as { where: { AND: { school: { OR: unknown[] } }[] } };
    expect(b.where.AND[0]!.school.OR).toContainEqual({ state: 'NC' });
  });
});

describe('RMH totals use the published figure (Q2 snapshot)', () => {
  it('listSchools, getCardData and getToday sum publishedCount for RMH, never the live count', async () => {
    m.medSchool.findMany.mockResolvedValue([school]);
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2027, date: d('2027-11-20') });
    m.medCycleCount.groupBy.mockResolvedValue([
      { schoolId: 's1', source: 'RMH', _sum: { count: 40, publishedCount: 6 } },
    ]);
    const list = await listSchools({}, NOW);
    expect(list.schools[0]!.reported).toEqual({ source: 'RMH', count: 6 });
    expect((await getCardData('duke', NOW))!.reported).toEqual({ source: 'RMH', count: 6 });
    const grouped = m.medCycleCount.groupBy.mock.calls[0]![0] as { _sum: Record<string, boolean> };
    expect(grouped._sum).toEqual({ count: true, publishedCount: true });
    m.medCycleCount.findMany.mockResolvedValue([
      {
        schoolId: 's1',
        source: 'RMH',
        count: 40,
        publishedCount: 6,
        school: { slug: 'duke', shortName: 'Duke', name: 'Duke', city: 'Durham', state: 'NC' },
      },
    ]);
    expect((await getToday({}, NOW)).schools[0]).toMatchObject({ source: 'RMH', count: 6 });
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
        school: { slug: 'duke', shortName: 'Duke', name: 'Duke', city: 'Durham', state: 'NC' },
      },
      {
        schoolId: 's1',
        source: 'ADMIT',
        count: 4,
        school: { slug: 'duke', shortName: 'Duke', name: 'Duke', city: 'Durham', state: 'NC' },
      },
    ]);
    const res = await getToday({}, NOW);
    expect(res).toMatchObject({ date: '2027-11-20', isToday: false });
    expect(res.schools).toEqual([
      { slug: 'duke', shortName: 'Duke', name: 'Duke', city: 'Durham', state: 'NC', count: 4, source: 'ADMIT' },
    ]);
  });

  it('respects the degree filter', async () => {
    m.medCycleCount.findFirst
      .mockResolvedValueOnce({ cycleYear: 2027 })
      .mockResolvedValueOnce({ date: d('2027-11-20') });
    await getToday({ degree: 'DO' }, NOW);
    const w = (m.medCycleCount.findMany.mock.calls[0]![0] as { where: { school: unknown } }).where;
    expect(w.school).toEqual({ active: true, degree: 'DO' });
  });

  it('is empty with no interview counts', async () => {
    const res = await getToday({}, NOW);
    expect(res).toMatchObject({ date: null, schools: [] });
  });
});

describe('slug guard', () => {
  it.each(['%00', 'DUKE', 'a'.repeat(81), '', 'du ke', 'duke/x'])('never queries for %j', async (slug) => {
    expect(await getSchool(slug, NOW)).toBeNull();
    expect(await getActivity(slug, {}, NOW)).toBeNull();
    expect(await getHistory(slug, {}, NOW)).toBeNull();
    expect(m.medSchool.findFirst).not.toHaveBeenCalled();
  });
});

describe('the k floor reaches every count read', () => {
  it('listSchools and getToday', async () => {
    m.medSchool.findMany.mockResolvedValue([school]);
    await listSchools({}, NOW);
    expect((m.medCycleCount.groupBy.mock.calls[0]![0] as { where: unknown }).where).toMatchObject(FLOOR);
    m.medCycleCount.findFirst.mockReset().mockResolvedValue({ cycleYear: 2027, date: d('2027-11-20') });
    await getToday({}, NOW);
    // getToday ANDs the floor with "positive on the public figure" (published count for RMH), each an OR of its own.
    const andOf = (a: unknown) => (a as { where: { AND: unknown[] } }).where.AND;
    expect(andOf(m.medCycleCount.findFirst.mock.calls.at(-1)![0])[0]).toEqual(FLOOR);
    expect(andOf(m.medCycleCount.findMany.mock.calls[0]![0])[0]).toEqual(FLOOR);
    expect(JSON.stringify(andOf(m.medCycleCount.findMany.mock.calls[0]![0])[1])).toContain('publishedCount');
  });

  it('history picks its four newest cycles from floored rows', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    await getHistory('duke', {}, NOW);
    const pick = m.medCycleCount.findMany.mock.calls[0]![0] as { where: unknown; take: number; distinct: unknown };
    expect(pick.where).toMatchObject(FLOOR);
    expect([pick.take, pick.distinct]).toEqual([4, ['cycleYear']]);
  });
});

describe('getCardData', () => {
  it('is null for an unknown, inactive or malformed slug without reading counts', async () => {
    expect(await getCardData('nope', NOW)).toBeNull();
    expect(await getCardData('Duke%00', NOW)).toBeNull();
    expect(m.medCycleCount.groupBy).not.toHaveBeenCalled();
  });

  it('returns the primary source count of floored interview rows for the school, both programs summed', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2027 });
    m.medCycleCount.groupBy.mockResolvedValue([
      { source: 'ADMIT', _sum: { count: 5, publishedCount: null } },
      { source: 'CYCLETRACK', _sum: { count: 9, publishedCount: null } },
    ]);
    expect(await getCardData('duke', NOW)).toEqual({
      slug: 'duke',
      name: 'Duke',
      degree: 'MD',
      city: 'Durham',
      state: 'NC',
      cycleYear: 2027,
      reported: { source: 'CYCLETRACK', count: 9 },
      figures: [],
      latest: null,
    });
    const arg = m.medCycleCount.groupBy.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(arg.where).toMatchObject({
      schoolId: 's1',
      cycleYear: 2027,
      eventType: 'INTERVIEW',
      program: { in: ['REG', 'PHD'] },
      ...FLOOR,
    });
  });

  it('has no figure when nothing is reported', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    const card = await getCardData('duke', NOW);
    expect(card?.reported).toBeNull();
    expect(card?.figures).toEqual([]);
    expect(card?.latest).toBeNull();
  });

  it("takes the newest class's MCAT and GPA from the school's own profile rows, as the page prints them", async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    const row = (kind: string, cycleYear: number, text: string, program = 'REG', qualifier: string | null = null) => ({
      kind,
      program,
      cycleYear,
      valueText: text,
      valueNum: Number(text),
      valueJson: { text, label: `Class ${cycleYear}`, evidence: `figure ${text}`, qualifier },
      sourceUrl: 'https://med.duke.edu/profile',
      checkedOn: d('2026-11-20'),
    });
    m.medSchoolFact.findMany.mockResolvedValue([
      row('PROFILE_MCAT_MEDIAN', 2025, '518'),
      row('PROFILE_MCAT_MEDIAN', 2026, '519'),
      row('PROFILE_GPA_MEAN', 2026, '3.82'),
      row('PROFILE_MCAT_MEAN', 2026, '521', 'PHD', 'MD-PhD (MSTP)'),
    ]);
    const card = await getCardData('duke', NOW);
    expect(card?.figures).toEqual([
      { kind: 'MCAT_MEDIAN', label: 'Median MCAT', value: '519', scope: null },
      { kind: 'GPA_MEAN', label: 'Mean GPA', value: '3.82', scope: null },
    ]);
    const arg = m.medSchoolFact.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(arg.where).toMatchObject({ schoolId: 's1', source: 'SCHOOL_PROFILE' });
  });

  it("reads the newest public event the index shows: Admit and SDN only, this school's site cycle", async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2027 });
    m.medCycleEvent.findMany.mockResolvedValue([
      { eventType: 'INTERVIEW', occurredAt: new Date('2026-11-24T00:00:00.000Z') },
    ]);
    const card = await getCardData('duke', NOW);
    expect(card?.latest).toEqual({ eventType: 'INTERVIEW', occurredAt: '2026-11-24T00:00:00.000Z', dayOnly: true });
    const arg = m.medCycleEvent.findMany.mock.calls[0]![0] as { where: Record<string, unknown>; take: number };
    expect(arg.where).toEqual({ schoolId: 's1', cycleYear: 2027, source: { in: ['ADMIT', 'SDN'] } });
    expect(arg.take).toBe(1);
  });
});

describe('getArrivals (when results arrive)', () => {
  const sql = (call: number) => (m.$queryRaw.mock.calls[call]![0] as string[]).join('?');

  it('is a 404 for an unknown school', async () => {
    m.medSchool.findFirst.mockResolvedValue(null);
    expect(await getArrivals('nope', {})).toBeNull();
    expect(m.$queryRaw).not.toHaveBeenCalled();
  });

  it('aggregates in SQL: ADMIT and SDN only, Eastern time, no day-only ADMIT or SDN event, no individual timestamp selected', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    await getArrivals('duke', { program: 'PHD', type: 'ACCEPTANCE' });
    expect(m.$queryRaw).toHaveBeenCalledTimes(2);
    for (const i of [0, 1]) {
      const q = sql(i);
      expect(q).toContain('IN (\'ADMIT\'::"MedSource", \'SDN\'::"MedSource")');
      expect(q).toContain('AT TIME ZONE');
      expect(q).toContain('NOT ("source" IN (\'ADMIT\'::"MedSource", \'SDN\'::"MedSource") AND');
      expect(q).toContain("TIME '00:00:00'");
      expect(q).not.toMatch(/SELECT\s+"occurredAt"/);
    }
    expect(sql(0)).toContain('GROUP BY 1, 2');
    expect(sql(1)).toContain('HAVING COUNT(*) >=');
  });

  it('under ten events the arrays are empty, from ten they are the shaped counts', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.$queryRaw.mockResolvedValueOnce([{ dow: 2, hr: 9, n: 9 }]).mockResolvedValueOnce([]);
    const few = (await getArrivals('duke', {}))!;
    expect(few).toMatchObject({ total: 9, weekdays: [], hours: [], cycles: [], zone: 'America/New_York' });
    m.$queryRaw
      .mockResolvedValueOnce([
        { dow: 2, hr: 9, n: 8 },
        { dow: 5, hr: 17, n: 4 },
      ])
      .mockResolvedValueOnce([{ cycleYear: 2026, n: 12, firstOn: '2025-11-03', medianOn: '2025-12-02' }]);
    const many = (await getArrivals('duke', { type: 'INTERVIEW' }))!;
    expect(many.total).toBe(12);
    expect(many.weekdays).toEqual([0, 8, 0, 0, 4, 0, 0]);
    expect(many.hours[9]).toBe(8);
    expect(many.cycles).toEqual([{ cycleYear: 2026, count: 12, firstOn: '2025-11-03', medianOn: '2025-12-02' }]);
    expect(Object.keys(many).sort()).toEqual(['cycles', 'eventType', 'hours', 'program', 'total', 'weekdays', 'zone']);
  });
});

describe('getForecast', () => {
  const CYCLE = 2028;
  const ZERO = '2027-06-01';
  const cnt = (
    source: string,
    date: string,
    count: number,
    contributors: number | null = null,
    published?: { count: number | null; contributors: number | null },
  ) => ({
    source,
    date: d(date),
    count,
    contributors,
    publishedCount: source === 'RMH' ? (published ? published.count : count) : null,
    publishedContributors: source === 'RMH' ? (published ? published.contributors : contributors) : null,
  });
  const row = (mode: 'FULL' | 'EARLY' | 'NONE', over: Record<string, unknown> = {}) => ({
    mode,
    source: 'ADMIT',
    asOf: d('2027-11-20'),
    curve:
      mode === 'NONE'
        ? { days: [], p10: [], p50: [], p90: [] }
        : { days: [172, 173, 174], p10: [10, 11, 12], p50: [10, 13, 16], p90: [10, 15, 20] },
    summary: {
      dayZeroOn: ZERO,
      observed: 10,
      meanShare: 0.4,
      total: mode === 'NONE' ? null : { p10: 20, p50: 30, p90: 40 },
      halfDay: mode === 'NONE' ? null : { p10: 160, p50: 180, p90: 200 },
      basis: mode === 'NONE' ? [] : [{ cycleYear: 2027, source: 'ADMIT', weight: 1 }],
    },
    ...over,
  });
  const setup = (forecast: unknown, counts: unknown[]) => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: CYCLE });
    m.medForecast.findFirst.mockResolvedValue(forecast);
    m.medCycleCount.findMany.mockResolvedValue(counts);
  };

  it('a FULL row is ready: the band is the stored curve, the observed line stops at the row asOf', async () => {
    setup(row('FULL'), [
      cnt('ADMIT', '2027-11-18', 4),
      cnt('ADMIT', '2027-11-20', 6),
      cnt('ADMIT', '2027-11-21', 9), // today: partial, after the row's asOf
    ]);
    const res = (await getForecast('duke', {}, NOW))!;
    expect(res.status).toBe('ready');
    expect(res.program).toBe('REG');
    expect(res.source).toBe('ADMIT');
    expect(res.asOf).toBe('2027-11-20');
    expect(res.observed).toEqual([
      { day: 170, cumulative: 4 },
      { day: 172, cumulative: 10 },
    ]);
    expect(res.band).toEqual([
      { day: 172, p10: 10, p50: 10, p90: 10 },
      { day: 173, p10: 11, p50: 13, p90: 15 },
      { day: 174, p10: 12, p50: 16, p90: 20 },
    ]);
    expect(res.summary).toEqual({
      total: { p10: 20, p50: 30, p90: 40 },
      halfOn: { p10: '2027-11-08', p50: '2027-11-28', p90: '2027-12-18' },
    });
    expect(res.endOn).toBe('2028-06-30'); // interviews belong to the cycle until June 30
    expect(Math.abs(res.basis.reduce((n, b) => n + b.weight, 0) - 1)).toBeLessThan(0.01);
  });

  it('a source that revised past days since the job ran: the band starts where the observed line ends', async () => {
    // The job saw 10 by Nov 20; Admit has since revised the days to 11 (up) or 8 (down).
    setup(row('FULL'), [cnt('ADMIT', '2027-11-18', 4), cnt('ADMIT', '2027-11-20', 7)]);
    const up = (await getForecast('duke', {}, NOW))!;
    expect(up.observed.at(-1)!.cumulative).toBe(11);
    expect(up.band[0]).toEqual({ day: 172, p10: 11, p50: 11, p90: 11 });
    expect(up.band[2]).toEqual({ day: 174, p10: 13, p50: 17, p90: 21 });
    expect(up.summary!.total).toEqual({ p10: 21, p50: 31, p90: 41 });
    setup(row('FULL'), [cnt('ADMIT', '2027-11-18', 4), cnt('ADMIT', '2027-11-20', 4)]);
    const down = (await getForecast('duke', {}, NOW))!;
    expect(down.observed.at(-1)!.cumulative).toBe(8);
    expect(down.band[0]).toEqual({ day: 172, p10: 8, p50: 8, p90: 8 });
    // Never below what is already observed, and unchanged rows stay unchanged (the test above).
    for (const b of down.band) expect(b.p10).toBeGreaterThanOrEqual(8);
  });

  it('EARLY is early, NONE is no-history with an empty band', async () => {
    setup(row('EARLY'), [cnt('ADMIT', '2027-11-18', 4)]);
    expect((await getForecast('duke', {}, NOW))!.status).toBe('early');
    setup(row('NONE'), [cnt('ADMIT', '2027-11-18', 4)]);
    const none = (await getForecast('duke', {}, NOW))!;
    expect(none.status).toBe('no-history');
    expect(none.band).toEqual([]);
    expect(none.summary).toBeNull();
    expect(none.observed).toHaveLength(1);
  });

  it('no row: pending with the observed line through yesterday, or no-data with nothing', async () => {
    setup(null, [cnt('ADMIT', '2027-11-18', 4), cnt('ADMIT', '2027-11-21', 9)]);
    const pending = (await getForecast('duke', {}, NOW))!;
    expect(pending.status).toBe('pending');
    expect(pending.asOf).toBeNull();
    expect(pending.observed).toEqual([{ day: 170, cumulative: 4 }]);
    setup(null, []);
    const none = (await getForecast('duke', {}, NOW))!;
    expect(none.status).toBe('no-data');
    expect(none.observed).toEqual([]);
    expect(none.dayZeroOn).toBe(ZERO);
  });

  it('ALL and an absent program both resolve to REG; PHD reads the PHD row', async () => {
    setup(null, []);
    expect((await getForecast('duke', { program: 'ALL' }, NOW))!.program).toBe('REG');
    expect((await getForecast('duke', {}, NOW))!.program).toBe('REG');
    await getForecast('duke', { program: 'PHD', type: 'ACCEPTANCE' }, NOW);
    const args = m.medForecast.findFirst.mock.calls.at(-1)![0] as { where: Record<string, unknown> };
    expect(args.where).toEqual({ schoolId: 's1', program: 'PHD', cycleYear: CYCLE, eventType: 'ACCEPTANCE' });
  });

  it('reads the site cycle through the floor, never the schools own newest', async () => {
    setup(null, []);
    await getForecast('duke', {}, NOW);
    const counts = m.medCycleCount.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(counts.where).toMatchObject({ schoolId: 's1', cycleYear: CYCLE, program: 'REG', ...{ OR: FLOOR.OR } });
    const latest = m.medCycleCount.findFirst.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(latest.where).toMatchObject(FLOOR);
  });

  it('an RMH-only school with an unpublished, a sub-k and a same-day cell has no observed line', async () => {
    setup(null, [
      cnt('RMH', '2027-11-10', 9, 9, { count: null, contributors: null }),
      cnt('RMH', '2027-11-11', 9, 9, { count: 9, contributors: 2 }),
      cnt('RMH', '2027-11-21', 9, 9, { count: 9, contributors: 9 }),
    ]);
    const res = (await getForecast('duke', {}, NOW))!;
    expect(res.status).toBe('no-data');
    expect(res.observed).toEqual([]);
    const text = JSON.stringify(res);
    for (const w of ['contributors', 'publishedCount', 'userId', 'dedupeHash']) expect(text).not.toContain(w);
  });

  it('an unknown, malformed or inactive slug is null', async () => {
    expect(await getForecast('DUKE', {}, NOW)).toBeNull();
    m.medSchool.findFirst.mockResolvedValue(null);
    expect(await getForecast('nope', {}, NOW)).toBeNull();
  });
});

describe('waves (D10)', () => {
  const cnt = (source: string, date: string, count: number) => ({
    source,
    date: d(date),
    eventType: 'INTERVIEW',
    count,
    contributors: null,
    publishedCount: null,
    publishedContributors: null,
  });
  const dayN = (n: number) => `2027-11-${String(n).padStart(2, '0')}`;
  const quiet = (source: string, spike?: number) =>
    Array.from({ length: 20 }, (_, i) => cnt(source, dayN(i + 1), i + 1 === spike ? 12 : 2));

  it('getActivity: 2 a day with 12 on one day is one wave, on the primary series, as a calendar date', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2028 });
    m.medCycleCount.findMany.mockResolvedValue(quiet('ADMIT', 15));
    const res = (await getActivity('duke', {}, NOW))!;
    expect(res.waves).toEqual([{ date: '2027-11-15', count: 12, baseline: 2 }]);
  });

  it('getActivity: waves follow REG + PHD whatever program the page shows, so they agree with the live feed', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2028 });
    // REG alone is 2 a day (no wave); PHD adds 10 on the 15th: together 12.
    const withProgram = (program: string) => (r: ReturnType<typeof cnt>) => ({ ...r, program });
    m.medCycleCount.findMany.mockResolvedValue([
      ...quiet('ADMIT').map(withProgram('REG')),
      { ...cnt('ADMIT', dayN(15), 10), program: 'PHD' },
    ]);
    for (const program of ['REG', 'PHD', 'ALL'] as const) {
      const res = (await getActivity('duke', { program }, NOW))!;
      expect(res.waves, program).toEqual([{ date: '2027-11-15', count: 12, baseline: 2 }]);
    }
    // The chart itself still shows only the requested program's events.
    const reg = (await getActivity('duke', { program: 'REG' }, NOW))!;
    expect(reg.types[0]!.sources[0]!.total).toBe(40);
  });

  it('getActivity: a wave in a source that is not primary is ignored; no INTERVIEW series is no waves', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2028 });
    m.medCycleCount.findMany.mockResolvedValue([...quiet('ADMIT'), ...quiet('SDN', 15)]);
    expect((await getActivity('duke', {}, NOW))!.waves).toEqual([]);
    m.medCycleCount.findMany.mockResolvedValue([]);
    expect((await getActivity('duke', {}, NOW))!.waves).toEqual([]);
  });

  it('getActivity: an RMH-only series with sub-k cells has no waves', async () => {
    m.medSchool.findFirst.mockResolvedValue(school);
    m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2028 });
    m.medCycleCount.findMany.mockResolvedValue(
      quiet('RMH', 15).map((r) => ({ ...r, publishedCount: r.count, publishedContributors: 2 })),
    );
    expect((await getActivity('duke', {}, NOW))!.waves).toEqual([]);
  });

  describe('getLive', () => {
    const ev = (id: string, eventType: string, at: string, slug = 'duke') => ({
      id,
      eventType,
      program: 'REG',
      source: 'ADMIT',
      occurredAt: new Date(at),
      school: { slug, shortName: 'Duke', name: 'Duke', degree: 'MD', city: 'Durham', state: 'NC' },
    });
    const withSchool = (rows: ReturnType<typeof quiet>) =>
      rows.map((r) => ({ ...r, cycleYear: 2028, school: { slug: 'duke' } }));

    it('flags an INTERVIEW row on the wave day only, with one batched read for the page', async () => {
      m.medCycleEvent.findMany.mockResolvedValue([
        ev('a', 'INTERVIEW', '2027-11-15T10:00:00Z'),
        ev('b', 'INTERVIEW', '2027-11-18T10:00:00Z'),
        ev('c', 'SECONDARY', '2027-11-15T10:00:00Z'),
        ev('e', 'INTERVIEW', '2027-11-15T12:00:00Z', 'unc'),
      ]);
      m.medCycleCount.findMany.mockResolvedValue(withSchool(quiet('ADMIT', 15)));
      const res = await getLive({}, NOW);
      expect(res.events.map((e) => [e.id, e.wave])).toEqual([
        ['a', true],
        ['b', false],
        ['c', false],
        ['e', false],
      ]);
      expect(m.medCycleCount.findMany).toHaveBeenCalledTimes(1);
      const args = m.medCycleCount.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
      expect(args.where).toMatchObject({ eventType: 'INTERVIEW', ...{ OR: FLOOR.OR } });
    });

    it('a burst after a quiet spell is a wave: the read goes back to the cycle, not a window around the page', async () => {
      // Reports 2 a day for ten days in September, nothing for over two months, then 12 on Nov 15.
      const september = Array.from({ length: 10 }, (_, i) =>
        cnt('ADMIT', `2027-09-${String(i + 1).padStart(2, '0')}`, 2),
      );
      m.medCycleEvent.findMany.mockResolvedValue([ev('a', 'INTERVIEW', '2027-11-15T10:00:00Z')]);
      m.medCycleCount.findMany.mockResolvedValue(withSchool([...september, cnt('ADMIT', '2027-11-15', 12)]));
      const res = await getLive({}, NOW);
      expect(res.events[0]!.wave).toBe(true);
      const args = m.medCycleCount.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
      expect(args.where).toMatchObject({ cycleYear: { in: [2028] } });
      expect(args.where).not.toHaveProperty('date');
    });

    it("the first report is the cycle's: a school that began reporting a week ago has no wave from its first days", async () => {
      const fresh = [dayN(10), dayN(11), dayN(12)].map((x) => cnt('ADMIT', x, 6));
      m.medCycleEvent.findMany.mockResolvedValue([ev('a', 'INTERVIEW', '2027-11-11T10:00:00Z')]);
      m.medCycleCount.findMany.mockResolvedValue(withSchool(fresh));
      expect((await getLive({}, NOW)).events[0]!.wave).toBe(false); // fewer than 7 days of data
    });

    it('the primary source is chosen over the whole cycle, as the Activity chart does', async () => {
      // ADMIT is primary all cycle; a burst in SDN (not primary) is not a wave, even when the page window shows only SDN.
      m.medCycleEvent.findMany.mockResolvedValue([ev('a', 'INTERVIEW', '2027-11-15T10:00:00Z')]);
      m.medCycleCount.findMany.mockResolvedValue(withSchool([...quiet('ADMIT'), ...quiet('SDN', 15)]));
      expect((await getLive({}, NOW)).events[0]!.wave).toBe(false);
    });

    it('a page with no INTERVIEW row reads no counts', async () => {
      m.medCycleEvent.findMany.mockResolvedValue([ev('c', 'SECONDARY', '2027-11-15T10:00:00Z')]);
      const res = await getLive({}, NOW);
      expect(res.events[0]!.wave).toBe(false);
      expect(m.medCycleCount.findMany).not.toHaveBeenCalled();
    });
  });
});
