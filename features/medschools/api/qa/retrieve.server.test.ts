import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    medSourceRun: d(),
    $queryRaw: vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []),
  };
});
vi.mock('@/lib/prisma.server', () => ({ prisma: m }));
vi.mock('@/lib/cached.server', () => ({
  cached: async (_k: string, _t: number, loader: () => Promise<unknown>) => loader(),
}));

import { retrieve } from './retrieve.server';
import { schoolDirectory, stampsFor } from './freshness.server';
import type { RouteResult } from '../../engine/qa/route';

const NOW = new Date('2027-11-21T00:30:00Z');
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const school = {
  id: 's1',
  slug: 'duke',
  name: 'Duke University School of Medicine',
  shortName: 'Duke',
  degree: 'MD',
  city: 'Durham',
  state: 'NC',
  website: null,
  interviewFormat: 'MMI',
  interviewType: null,
};
const route = (o: Partial<RouteResult> = {}): RouteResult => ({
  intent: 'facts',
  schools: ['Duke'],
  cycle: null,
  filters: { state: null, format: null },
  ...o,
});
const cell = (
  source: string,
  date: string,
  eventType: string,
  count: number,
  published?: { count: number | null; contributors: number | null },
  program = 'REG',
) => ({
  source,
  program,
  date: d(date),
  eventType,
  count,
  contributors: null as number | null,
  publishedCount: source === 'RMH' ? (published ? published.count : count) : null,
  publishedContributors: source === 'RMH' ? (published ? published.contributors : null) : null,
});
const text = (r: { facts: { text: string }[] }) => r.facts.map((f) => f.text).join('\n');

beforeEach(() => {
  for (const delegate of Object.values(m).filter((x) => 'findMany' in x)) {
    delegate.findMany.mockReset().mockResolvedValue([]);
    delegate.groupBy.mockReset().mockResolvedValue([]);
    delegate.findFirst.mockReset().mockResolvedValue(null);
    delegate.findUnique.mockReset().mockResolvedValue(null);
    delegate.count.mockReset().mockResolvedValue(0);
  }
  m.$queryRaw.mockReset().mockResolvedValue([]);
  m.medSchool.findFirst.mockResolvedValue(school);
  m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2027 });
});

/** getSchool reads the programs through a `distinct`; every other count read is the activity reader's. */
function counts(rows: unknown[], programs: string[] = ['REG']) {
  m.medCycleCount.findMany.mockImplementation(async (...a: unknown[]) => {
    const distinct = (a[0] as { distinct?: string[] }).distinct;
    if (distinct?.includes('cycleYear')) return [{ cycleYear: 2027 }];
    if (distinct) return programs.map((program) => ({ program }));
    return rows;
  });
}

describe('retrieve: the floor, through the real readers', () => {
  it('quotes no suppressed RMH figure', async () => {
    counts([
      cell('CYCLETRACK', '2026-11-10', 'INTERVIEW', 40),
      cell('RMH', '2026-11-10', 'INTERVIEW', 99, { count: 99, contributors: 2 }),
      cell('RMH', '2026-11-11', 'SECONDARY', 77, { count: null, contributors: 5 }),
      cell('RMH', '2027-11-21', 'ACCEPTANCE', 66, { count: 66, contributors: 9 }),
    ]);
    const r = await retrieve(route(), ['duke'], NOW);
    const all = text(r);
    expect(all).toContain('40 reported interview events');
    for (const n of ['99', '77', '66']) expect(all).not.toContain(n);
    expect(r.facts.map((f) => f.sourceName)).not.toContain('RMH tracker');
    expect(r.facts.map((f) => f.source)).not.toContain('RMH');
  });

  it('shows an RMH figure at 3 published contributors dated before today, stamped with the publish run', async () => {
    m.medSourceRun.findMany.mockResolvedValue([
      { source: 'CYCLETRACK', finishedAt: new Date('2027-11-20T10:00:00Z') },
      { source: 'RMH', finishedAt: new Date('2027-11-21T00:06:00Z') },
    ]);
    counts([
      cell('CYCLETRACK', '2026-11-10', 'INTERVIEW', 40),
      cell('RMH', '2026-11-20', 'INTERVIEW', 8, { count: 8, contributors: 3 }),
    ]);
    const r = await retrieve(route(), ['duke'], NOW);
    const rmh = r.facts.find((f) => f.source === 'RMH')!;
    expect(rmh.sourceName).toBe('RMH tracker');
    expect(rmh.updatedAt).toBe('2027-11-21T00:06:00.000Z');
    expect(rmh.text).toMatch(/^Comparison, a different source and not added to CycleTrack/);
  });
});

describe('retrieve: the primary source', () => {
  it('states CycleTrack as the primary and Admit as a labelled comparison, never a sum', async () => {
    counts([cell('CYCLETRACK', '2026-11-10', 'INTERVIEW', 40), cell('ADMIT', '2026-11-10', 'INTERVIEW', 25)]);
    const r = await retrieve(route(), ['duke'], NOW);
    const events = r.facts.filter((f) => f.label === 'Reported events');
    expect(events[0]!.text).toContain('CycleTrack: 40 reported interview events');
    expect(events[1]!.text).toMatch(
      /^Comparison, a different source and not added to CycleTrack: Admit\.org reports 25 /,
    );
    expect(text(r)).not.toContain('65');
  });
});

describe('retrieve: schools and cycles', () => {
  it('returns nothing for an inactive or unknown slug', async () => {
    m.medSchool.findFirst.mockResolvedValue(null);
    const r = await retrieve(route(), ['closed'], NOW);
    expect(r.schools).toEqual([]);
    expect(r.facts).toEqual([]);
    expect(r.thin).toBe(true);
  });

  it('reports a school with no data as thin', async () => {
    counts([]);
    const r = await retrieve(route(), ['duke'], NOW);
    expect(r.schools).toEqual([{ slug: 'duke', shortName: 'Duke' }]);
    expect(r.facts.map((f) => f.label)).toEqual(['School']);
    expect(r.thin).toBe(true);
  });

  const activityCycle = () => {
    const call = m.medCycleCount.findMany.mock.calls
      .map((c) => c[0] as { where: { cycleYear?: number; eventType?: { in: string[] } } })
      .find((a) => a.where.eventType?.in);
    return call?.where.cycleYear;
  };
  it('uses the asked cycle when it is near the site cycle and falls back for 1999', async () => {
    counts([]);
    expect((await retrieve(route({ cycle: 2026 }), ['duke'], NOW)).cycleYear).toBe(2026);
    expect(activityCycle()).toBe(2026);
    m.medCycleCount.findMany.mockClear();
    expect((await retrieve(route({ cycle: 1999 }), ['duke'], NOW)).cycleYear).toBe(2027);
    expect(activityCycle()).toBe(2027);
  });
});

describe('retrieve: per intent', () => {
  it('keeps MD and MD-PhD separate for timing', async () => {
    counts(
      [
        cell('CYCLETRACK', '2026-11-10', 'INTERVIEW', 40),
        { ...cell('CYCLETRACK', '2026-11-10', 'INTERVIEW', 3), program: 'PHD' },
      ],
      ['REG', 'PHD'],
    );
    m.medForecast.findFirst.mockResolvedValue(null);
    const r = await retrieve(route({ intent: 'timing' }), ['duke'], NOW);
    const programs = m.medCycleCount.findMany.mock.calls
      .map((c) => (c[0] as { where: { program?: unknown } }).where.program)
      .filter((p) => p !== undefined);
    expect(programs.length).toBeGreaterThan(0);
    expect(r.facts.some((f) => f.text.includes('Duke, MD-PhD,'))).toBe(true);
    expect(r.facts.some((f) => f.text.includes('Duke, MD,'))).toBe(true);
  });

  it('asks for questions only on the interviews intent', async () => {
    counts([]);
    m.medInterviewQuestion.findMany.mockResolvedValue([
      { text: 'Why medicine?', source: 'ADMIT', votes: 4, cycleYear: 2027 },
    ]);
    const asked = await retrieve(route({ intent: 'interviews' }), ['duke'], NOW);
    expect(asked.facts.filter((f) => f.untrusted).map((f) => f.text)).toEqual([
      'Duke interview question: Why medicine?',
    ]);
    expect(asked.thin).toBe(false);
    const facts = await retrieve(route({ intent: 'facts' }), ['duke'], NOW);
    expect(facts.facts.some((f) => f.untrusted)).toBe(false);
  });

  it('caps the facts it hands on', async () => {
    counts(
      Array.from({ length: 5 }, (_, i) => cell('CYCLETRACK', `2026-11-1${i}`, 'INTERVIEW', 40 + i)),
      ['REG'],
    );
    m.medInterviewQuestion.findMany.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => ({ text: `question ${i}`, source: 'SDN', votes: i, cycleYear: 2027 })),
    );
    const r = await retrieve(route({ intent: 'interviews' }), ['duke'], NOW);
    expect(r.facts.length).toBeLessThanOrEqual(40);
    expect(r.facts.filter((f) => f.untrusted)).toHaveLength(8);
  });
});

describe('freshness', () => {
  it('stamps counts per source from the latest OK run, profiles from fetchedAt', async () => {
    m.medSourceRun.findMany.mockResolvedValue([{ source: 'CYCLETRACK', finishedAt: new Date('2027-11-20T10:00:00Z') }]);
    m.medInterviewProfile.findMany.mockResolvedValue([
      { source: 'ADMIT', fetchedAt: new Date('2027-11-19T00:00:00Z') },
    ]);
    m.medInterviewQuestion.findFirst.mockResolvedValue({ updatedAt: new Date('2027-11-18T00:00:00Z') });
    m.medForecast.findFirst.mockResolvedValue({ computedAt: new Date('2027-11-21T06:40:00Z') });
    const s = await stampsFor('duke');
    expect(s).toEqual({
      counts: { CYCLETRACK: '2027-11-20T10:00:00.000Z' },
      profile: { ADMIT: '2027-11-19T00:00:00.000Z' },
      questions: '2027-11-18T00:00:00.000Z',
      forecast: '2027-11-21T06:40:00.000Z',
    });
    expect(m.medSourceRun.findMany.mock.calls[0]![0]).toMatchObject({
      where: { status: 'OK', finishedAt: { not: null } },
      distinct: ['source'],
    });
  });

  it('leaves a missing timestamp null', async () => {
    expect(await stampsFor('duke')).toEqual({ counts: {}, profile: {}, questions: null, forecast: null });
  });

  it('lists active schools by public header columns only', async () => {
    m.medSchool.findMany.mockResolvedValue([
      { slug: 'duke', name: 'Duke', shortName: 'Duke', state: 'NC', interviewFormat: null },
    ]);
    expect(await schoolDirectory()).toEqual([
      { slug: 'duke', name: 'Duke', shortName: 'Duke', state: 'NC', interviewFormat: null },
    ]);
    expect(m.medSchool.findMany.mock.calls[0]![0]).toMatchObject({ where: { active: true } });
  });
});

describe('boundary: no tracker row, no user, no count delegate of its own', () => {
  it.each(['retrieve.server.ts', 'freshness.server.ts'])('%s', (file) => {
    const src = readFileSync(join(__dirname, file), 'utf8');
    for (const banned of [
      'medTracker',
      'medSchoolList',
      'medUserPrefs',
      'medCycleEvent',
      'medCycleCount',
      'medSchoolStats',
      'userId',
      'getTracker',
      'getChances',
    ]) {
      expect(src, banned).not.toContain(banned);
    }
  });
});
