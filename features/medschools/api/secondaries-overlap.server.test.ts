import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from '../scrape/test-support';

const fake = vi.hoisted(() => ({ current: null as null | { prisma: unknown }, reads: [] as string[] }));
vi.mock('@/lib/prisma.server', () => ({
  get prisma() {
    return fake.current?.prisma;
  },
}));

import { getOverlap } from './secondaries-overlap.server';

const NOW = new Date('2026-11-23T12:00:00Z');
const CHECKED = new Date('2026-11-20T00:00:00Z');
let f: ReturnType<typeof createFakePrisma>;

const school = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  slug: `school-${id}`,
  name: `School ${id}`,
  active: true,
  ...over,
});
const prompt = (id: string, schoolId: string, text: string, over: Record<string, unknown> = {}) => ({
  id,
  schoolId,
  program: 'REG',
  key: id,
  text,
  themes: ['diversity'],
  themesVersion: 1,
  ...over,
});
const obs = (promptId: string, cycleYear = 2027, over: Record<string, unknown> = {}) => ({
  id: `${promptId}-${cycleYear}`,
  promptId,
  cycleYear,
  source: 'ADMIT',
  limitKind: 'WORDS',
  limitValue: 250,
  optional: false,
  sourceRef: null,
  firstSeenAt: CHECKED,
  lastCheckedAt: CHECKED,
  ...over,
});

beforeEach(() => {
  f = createFakePrisma();
  fake.current = f;
  f.tables.medSchool.push(school('a'), school('b'), school('c'), school('off', { active: false }));
  f.tables.medSecondaryPrompt.push(
    prompt('pa', 'a', 'Describe how your background would add to the diversity of our class.'),
    prompt('pb', 'b', 'How will your experiences contribute to a diverse learning community here?', {
      themes: ['diversity'],
    }),
    prompt('poff', 'off', 'An inactive school prompt that must never be listed anywhere.'),
    prompt('pa-phd', 'a', 'Why an MD-PhD and what is your research goal in the long term?', {
      program: 'PHD',
      themes: ['research'],
    }),
  );
  f.tables.medSecondaryObservation.push(obs('pa'), obs('pb', 2027, { limitValue: 300 }), obs('poff'), obs('pa-phd'));
  f.tables.medSchoolList.push({ id: 'L1', userId: 'alice', name: 'Secret list name', position: 0 });
  f.tables.medSchoolList.push({ id: 'L2', userId: 'bob', name: 'Bob list', position: 0 });
  f.tables.medSchoolListItem.push(
    { id: 'i1', listId: 'L1', schoolId: 'a', program: 'ANY', note: 'private note', position: 0 },
    { id: 'i2', listId: 'L1', schoolId: 'b', program: 'REG', note: null, position: 1 },
    { id: 'i3', listId: 'L1', schoolId: 'c', program: 'REG', note: null, position: 2 },
    { id: 'i4', listId: 'L1', schoolId: 'off', program: 'REG', note: null, position: 3 },
    { id: 'i5', listId: 'L2', schoolId: 'c', program: 'REG', note: 'bob note', position: 0 },
  );
});

describe('getOverlap (list)', () => {
  it('groups the list schools by theme; a school with no prompts is listed apart; an inactive one is nowhere', async () => {
    const r = await getOverlap('alice', { source: 'list', list: 'L1' }, NOW);
    if (r === 'not-found') throw new Error('expected a result');
    expect(r.source).toBe('list');
    expect(r.cycleYear).toBe(2027);
    expect(r.schoolCount).toBe(3);
    expect(r.groups.map((g) => [g.theme, g.schools, g.shortestWords, g.longestWords])).toEqual([
      ['diversity', 2, 250, 300],
    ]);
    expect(r.withoutPrompts).toEqual([{ slug: 'school-c', name: 'School c' }]);
    expect(JSON.stringify(r)).not.toMatch(/off|Secret list name|private note|bob/);
  });

  it('pins the response key set and carries no user, list, item or note', async () => {
    const r = await getOverlap('alice', { source: 'list', list: 'L1' }, NOW);
    if (r === 'not-found') throw new Error('expected a result');
    expect(Object.keys(r).sort()).toEqual(['cycleYear', 'groups', 'schoolCount', 'source', 'withoutPrompts']);
    expect(Object.keys(r.groups[0]!).sort()).toEqual(['entries', 'longestWords', 'schools', 'shortestWords', 'theme']);
    expect(Object.keys(r.groups[0]!.entries[0]!).sort()).toEqual(
      ['basis', 'limit', 'optional', 'program', 'promptId', 'schoolName', 'slug', 'text'].sort(),
    );
  });

  it("another member's list is not-found, the same as a missing one, and nothing else is read", async () => {
    expect(await getOverlap('bob', { source: 'list', list: 'L1' }, NOW)).toBe('not-found');
    expect(await getOverlap('alice', { source: 'list', list: 'nope' }, NOW)).toBe('not-found');
  });

  it('a PHD item brings the regular prompts too, each labelled by program; the same school twice is one school', async () => {
    f.tables.medSchoolListItem.push({ id: 'i6', listId: 'L1', schoolId: 'a', program: 'PHD', note: null, position: 4 });
    const r = await getOverlap('alice', { source: 'list', list: 'L1' }, NOW);
    if (r === 'not-found') throw new Error('expected a result');
    expect(r.schoolCount).toBe(3);
    const research = r.groups.find((g) => g.theme === 'research');
    expect(research?.entries.map((e) => [e.slug, e.program])).toEqual([['school-a', 'PHD']]);
    expect(r.groups.find((g) => g.theme === 'diversity')?.entries.map((e) => e.program)).toEqual(['REG', 'REG']);
  });

  it('an empty list is an empty result, not an error', async () => {
    f.tables.medSchoolList.push({ id: 'L3', userId: 'alice', name: 'Empty', position: 1 });
    expect(await getOverlap('alice', { source: 'list', list: 'L3' }, NOW)).toMatchObject({
      groups: [],
      withoutPrompts: [],
      schoolCount: 0,
    });
  });

  it('reads the prompts of every school in one query, not one per school', async () => {
    const real = f.prisma.medSecondaryPrompt.findMany.bind(f.prisma.medSecondaryPrompt);
    let calls = 0;
    f.prisma.medSecondaryPrompt.findMany = async (a) => {
      calls += 1;
      return real(a);
    };
    await getOverlap('alice', { source: 'list', list: 'L1' }, NOW);
    expect(calls).toBe(1);
  });

  it('a school with only last cycle prompts is shown with the last-cycle basis', async () => {
    f.tables.medSecondaryObservation = f.tables.medSecondaryObservation.filter(
      (o) => (o as { promptId: string }).promptId !== 'pb',
    );
    f.tables.medSecondaryObservation.push(obs('pb', 2026));
    const r = await getOverlap('alice', { source: 'list', list: 'L1' }, NOW);
    if (r === 'not-found') throw new Error('expected a result');
    const entry = r.groups[0]!.entries.find((e) => e.slug === 'school-b');
    expect(entry?.basis).toBe('last-cycle');
  });
});

describe('getOverlap in summer, before any interview of the new cycle', () => {
  // July 2026: `siteCycleYear` still reads 2026 (it follows interviews); prompts and the tracker are the 2027 secondary cycle.
  const JULY = new Date('2026-07-15T12:00:00Z');
  it('the list overlap reads the secondary cycle, so both halves agree with the tracker', async () => {
    const r = await getOverlap('alice', { source: 'list', list: 'L1' }, JULY);
    if (r === 'not-found') throw new Error('expected a result');
    expect(r.cycleYear).toBe(2027);
    expect(r.groups.flatMap((g) => g.entries).length).toBeGreaterThan(0);
  });
  it('the tracker overlap finds the 2027 applications and shows their 2027 prompts', async () => {
    f.tables.medTrackerCycle.push({ id: 'ca', userId: 'alice', cycleYear: 2027 });
    f.tables.medTrackerApplication.push({ id: 'x1', cycleId: 'ca', schoolId: 'a', program: 'REG' });
    const r = await getOverlap('alice', { source: 'tracker' }, JULY);
    if (r === 'not-found') throw new Error('expected a result');
    expect(r.cycleYear).toBe(2027);
    expect(r.schoolCount).toBe(1);
    expect(r.groups.flatMap((g) => g.entries).map((e) => e.slug)).toEqual(['school-a']);
  });
});

describe('getOverlap (tracker)', () => {
  it("reads only the caller's applications of the current cycle", async () => {
    f.tables.medTrackerCycle.push(
      { id: 'ca', userId: 'alice', cycleYear: 2027 },
      { id: 'ca-old', userId: 'alice', cycleYear: 2026 },
      { id: 'cb', userId: 'bob', cycleYear: 2027 },
    );
    f.tables.medTrackerApplication.push(
      { id: 'x1', cycleId: 'ca', schoolId: 'a', program: 'REG' },
      { id: 'x2', cycleId: 'ca-old', schoolId: 'b', program: 'REG' },
      { id: 'x3', cycleId: 'cb', schoolId: 'c', program: 'REG' },
    );
    const r = await getOverlap('alice', { source: 'tracker' }, NOW);
    if (r === 'not-found') throw new Error('expected a result');
    expect(r.source).toBe('tracker');
    expect(r.schoolCount).toBe(1);
    expect(r.groups[0]!.entries.map((e) => e.slug)).toEqual(['school-a']);
  });

  it('a member with no application this cycle gets an empty result', async () => {
    expect(await getOverlap('alice', { source: 'tracker' }, NOW)).toMatchObject({ groups: [], schoolCount: 0 });
  });

  it("every read of a private table carries the caller's user id", async () => {
    f.tables.medTrackerCycle.push({ id: 'ca', userId: 'alice', cycleYear: 2027 });
    const wheres: { table: string; where: Record<string, unknown> }[] = [];
    for (const t of ['medSchoolList', 'medTrackerCycle'] as const) {
      const d = (f.prisma as unknown as Record<string, unknown>)[t] as {
        findFirst: (a?: { where?: Record<string, unknown> }) => Promise<unknown>;
      };
      const real = d.findFirst.bind(d);
      d.findFirst = async (a) => {
        wheres.push({ table: t, where: a?.where ?? {} });
        return real(a);
      };
    }
    await getOverlap('alice', { source: 'list', list: 'L1' }, NOW);
    await getOverlap('alice', { source: 'tracker' }, NOW);
    expect(wheres).toHaveLength(2);
    for (const w of wheres) expect(w.where.userId, w.table).toBe('alice');
  });
});
