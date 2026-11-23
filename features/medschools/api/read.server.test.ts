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

import { getActivity, getCardData, getHistory, getLive, getSchool, getToday, listSchools } from './read.server';

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
// The k floor plus Q2: an RMH cell needs 3 contributors AND a date before today UTC (NOW is 2027-11-21).
const FLOOR = {
  OR: [{ source: { not: 'RMH' } }, { contributors: { gte: 3 }, date: { lt: d('2027-11-21') } }],
};

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
    school: { slug: 'duke', shortName: 'Duke', name: 'Duke', degree: 'MD', city: 'Durham', state: 'NC' },
  });

  it('is public-source only, exact keys, minute-truncated, null program kept', async () => {
    m.medCycleEvent.findMany.mockResolvedValue([row('b', '2026-11-20T10:15:42.123Z', null)]);
    const res = await getLive({}, NOW);
    const args = m.medCycleEvent.findMany.mock.calls[0]![0] as { where: { source: unknown } };
    expect(args.where.source).toEqual({ in: ['ADMIT', 'SDN'] });
    const e = res.events[0]!;
    expect(e.program).toBeNull();
    expect(Object.keys(e).sort()).toEqual(['eventType', 'id', 'occurredAt', 'program', 'school', 'source']);
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

  it('reads one program when asked and 404s unknown slugs', async () => {
    m.medSchool.findFirst.mockResolvedValueOnce(null);
    expect(await getActivity('nope', {}, NOW)).toBeNull();
    m.medSchool.findFirst.mockResolvedValue(school);
    await getActivity('duke', { program: 'PHD' }, NOW);
    const args = m.medCycleCount.findMany.mock.calls[0]![0] as { where: { program: unknown } };
    expect(args.where.program).toEqual({ in: ['PHD'] });
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
    for (const [a] of m.medCycleCount.findFirst.mock.calls) {
      expect((a as { where: unknown }).where).toMatchObject(FLOOR);
    }
    expect((m.medCycleCount.findMany.mock.calls[0]![0] as { where: unknown }).where).toMatchObject(FLOOR);
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
      { source: 'ADMIT', _sum: { count: 5 } },
      { source: 'CYCLETRACK', _sum: { count: 9 } },
    ]);
    expect(await getCardData('duke', NOW)).toEqual({
      name: 'Duke',
      degree: 'MD',
      city: 'Durham',
      state: 'NC',
      cycleYear: 2027,
      reported: { source: 'CYCLETRACK', count: 9 },
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
  });
});
