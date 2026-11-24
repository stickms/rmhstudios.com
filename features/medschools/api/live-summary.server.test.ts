import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  const d = () => ({
    findMany: vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []),
    findFirst: vi.fn(async (..._a: unknown[]): Promise<unknown> => null),
    groupBy: vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []),
  });
  return { medSchool: d(), medCycleCount: d(), medCycleEvent: d() };
});
vi.mock('@/lib/prisma.server', () => ({ prisma: m }));

import { getLiveSummary } from './live-summary.server';

// 2027-11-21 15:00 UTC: the window is from 2027-11-20 15:00; the site cycle is 2028 (Nov is past the June rollover).
const NOW = new Date('2027-11-21T15:00:00Z');
const school = (id: string, name: string, state = 'NC') => ({
  id,
  slug: id,
  shortName: name,
  name,
  degree: 'MD',
  city: 'City',
  state,
});
const g = (schoolId: string, eventType: string, n: number) => ({ schoolId, eventType, _count: { _all: n } });
const cnt = (slug: string, date: string, count: number) => ({
  source: 'ADMIT',
  date: new Date(`${date}T00:00:00Z`),
  eventType: 'INTERVIEW',
  cycleYear: 2028,
  count,
  contributors: null,
  publishedCount: null,
  publishedContributors: null,
  school: { slug },
});
const day = (n: number) => `2027-11-${String(n).padStart(2, '0')}`;

beforeEach(() => {
  for (const delegate of Object.values(m)) {
    delegate.findMany.mockReset().mockResolvedValue([]);
    delegate.findFirst.mockReset().mockResolvedValue(null);
    delegate.groupBy.mockReset().mockResolvedValue([]);
  }
  m.medCycleCount.findFirst.mockResolvedValue({ cycleYear: 2028 });
});

describe('getLiveSummary', () => {
  it("reads the live feed's events only: Admit and SDN, active schools, the last 24 hours, no cycle filter", async () => {
    await getLiveSummary({}, NOW);
    const args = m.medCycleEvent.groupBy.mock.calls[0]![0] as { by: string[]; where: Record<string, unknown> };
    expect(args.by).toEqual(['schoolId', 'eventType']);
    expect(args.where).toEqual({
      source: { in: ['ADMIT', 'SDN'] },
      occurredAt: { gte: new Date('2027-11-20T15:00:00Z'), lte: NOW },
      school: { active: true },
    });
  });

  it('honours the program set and the states as the live feed does', async () => {
    await getLiveSummary({ programs: 'md,do-phd', state: 'TX,NC' }, NOW);
    const args = m.medCycleEvent.groupBy.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(args.where.school).toEqual({ active: true, state: { in: ['NC', 'TX'] } });
    expect(args.where.AND).toEqual([
      {
        OR: [
          { program: 'REG', school: { degree: 'MD' } },
          { program: 'PHD', school: { degree: 'DO' } },
        ],
      },
    ]);
    // Every program on is no filter (and so takes the events with no program reported).
    m.medCycleEvent.groupBy.mockClear();
    await getLiveSummary({ programs: 'md,md-phd,do,do-phd' }, NOW);
    expect(m.medCycleEvent.groupBy.mock.calls[0]![0]).not.toHaveProperty('where.AND');
  });

  it('counts by type (most first), the five most active schools, with the exact key sets', async () => {
    m.medCycleEvent.groupBy.mockResolvedValue([
      g('a', 'INTERVIEW', 3),
      g('a', 'REJECTION', 1),
      g('b', 'ACCEPTANCE', 2),
      g('c', 'SECONDARY', 1),
      g('d', 'SECONDARY', 1),
      g('e', 'SECONDARY', 1),
      g('f', 'SECONDARY', 1),
    ]);
    m.medSchool.findMany.mockResolvedValue(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => school(id, `School ${id.toUpperCase()}`)),
    );
    const res = await getLiveSummary({}, NOW);
    expect(Object.keys(res).sort()).toEqual(['active', 'asOf', 'counts', 'since', 'waves']);
    expect(res.asOf).toBe(NOW.toISOString());
    expect(res.since).toBe('2027-11-20T15:00:00.000Z');
    expect(res.counts).toEqual([
      { eventType: 'SECONDARY', count: 4 },
      { eventType: 'INTERVIEW', count: 3 },
      { eventType: 'ACCEPTANCE', count: 2 },
      { eventType: 'REJECTION', count: 1 },
    ]);
    expect(res.active.map((a) => [a.school.slug, a.count])).toEqual([
      ['a', 4],
      ['b', 2],
      ['c', 1],
      ['d', 1],
      ['e', 1],
    ]);
    expect(Object.keys(res.active[0]!).sort()).toEqual(['count', 'school']);
    expect(Object.keys(res.active[0]!.school).sort()).toEqual(['city', 'degree', 'name', 'shortName', 'slug', 'state']);
  });

  it('reads the schools with an explicit select and nothing person-shaped', async () => {
    m.medCycleEvent.groupBy.mockResolvedValue([g('a', 'INTERVIEW', 1)]);
    m.medSchool.findMany.mockResolvedValue([school('a', 'A')]);
    await getLiveSummary({}, NOW);
    const args = m.medSchool.findMany.mock.calls[0]![0] as { where: unknown; select: Record<string, boolean> };
    expect(args.where).toEqual({ id: { in: ['a'] }, active: true });
    expect(Object.keys(args.select).sort()).toEqual(['city', 'degree', 'id', 'name', 'shortName', 'slug', 'state']);
    for (const [a] of m.medCycleCount.findMany.mock.calls) {
      expect((a as { select?: unknown }).select).toBeTypeOf('object');
      expect(JSON.stringify((a as { select: unknown }).select)).not.toMatch(/inState|dedupeHash|ingestedAt|userId/);
    }
  });

  it("names a school's interview wave on today's UTC day only, with that day's count", async () => {
    m.medCycleEvent.groupBy.mockResolvedValue([
      g('a', 'INTERVIEW', 5),
      g('b', 'INTERVIEW', 2),
      g('c', 'ACCEPTANCE', 9),
    ]);
    m.medSchool.findMany.mockResolvedValue([school('a', 'A'), school('b', 'B'), school('c', 'C')]);
    // `a`: 2 a day, 12 today (a wave today). `b`: 2 a day, 12 on the 15th (a wave, but not today).
    m.medCycleCount.findMany.mockResolvedValue([
      ...Array.from({ length: 21 }, (_, i) => cnt('a', day(i + 1), i + 1 === 21 ? 12 : 2)),
      ...Array.from({ length: 21 }, (_, i) => cnt('b', day(i + 1), i + 1 === 15 ? 12 : 2)),
    ]);
    const res = await getLiveSummary({}, NOW);
    expect(res.waves).toEqual([{ school: rest(school('a', 'A')), count: 12 }]);
    // Only schools with an invite in the window are checked, in one batched read of the site cycle.
    expect(m.medCycleCount.findMany).toHaveBeenCalledTimes(1);
    const args = m.medCycleCount.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({
      eventType: 'INTERVIEW',
      cycleYear: { in: [2028] },
      school: { slug: { in: ['a', 'b'] }, active: true },
    });
  });

  it('an empty window reads no schools and no counts, and says nothing', async () => {
    const res = await getLiveSummary({}, NOW);
    expect(res).toMatchObject({ counts: [], waves: [], active: [] });
    expect(m.medSchool.findMany).not.toHaveBeenCalled();
    expect(m.medCycleCount.findMany).not.toHaveBeenCalled();
  });
});

/** The public school shape: the row without its database id. */
function rest(s: ReturnType<typeof school>) {
  const { id: _id, ...out } = s;
  return out;
}
