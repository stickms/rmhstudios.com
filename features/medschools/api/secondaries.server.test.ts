import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from '../scrape/test-support';

const fake = vi.hoisted(() => ({ current: null as null | { prisma: unknown } }));
vi.mock('@/lib/prisma.server', () => ({
  get prisma() {
    return fake.current?.prisma;
  },
}));

import { getSchoolSecondaries } from './secondaries.server';

const CHECKED = new Date('2026-11-20T05:35:00Z');
let f: ReturnType<typeof createFakePrisma>;

const prompt = (id: string, text: string, over: Record<string, unknown> = {}) => ({
  id,
  schoolId: 's1',
  program: 'REG',
  key: id,
  text,
  themes: ['diversity'],
  themesVersion: 1,
  ...over,
});
const obs = (promptId: string, cycleYear: number, source = 'ADMIT', over: Record<string, unknown> = {}) => ({
  id: `${promptId}-${cycleYear}-${source}`,
  promptId,
  cycleYear,
  source,
  limitKind: 'WORDS',
  limitValue: 250,
  optional: false,
  sourceRef: null,
  firstSeenAt: CHECKED,
  lastCheckedAt: CHECKED,
  ...over,
});

beforeEach(() => {
  // The cycle is read from the clock (the secondary cycle rolls over on June 1): pin it so the suite does not age.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-23T12:00:00Z'));
  f = createFakePrisma();
  fake.current = f;
  f.tables.medSchool.push(
    { id: 's1', slug: 'duke', name: 'Duke', active: true },
    { id: 's2', slug: 'gone', name: 'Gone', active: false },
  );
});

afterEach(() => vi.useRealTimers());

const KEYS = ['cycleYear', 'groups', 'sources', 'admissions', 'turnaround'];

describe('getSchoolSecondaries', () => {
  it('shapes prompts through the school view: cycles, marks, limit, optional and sources', async () => {
    f.tables.medSecondaryPrompt.push(
      prompt('p1', 'Describe a challenge you faced and how you responded to it.'),
      prompt('p2', 'Why is our school the right place for your training?'),
    );
    f.tables.medSecondaryObservation.push(
      obs('p1', 2026),
      obs('p1', 2027),
      obs('p1', 2027, 'SDN'),
      obs('p2', 2026, 'ADMIT', { limitKind: 'CHARS', limitValue: 1500, optional: true }),
    );
    // Admit's page was read this cycle, and the prompt is no longer on it.
    f.tables.medSecondaryCheck.push({ id: 'c0', schoolId: 's1', source: 'ADMIT', checkedAt: CHECKED, status: 'OK', promptCount: 1 });
    const r = await getSchoolSecondaries('duke', {});
    expect(Object.keys(r!).sort()).toEqual([...KEYS].sort());
    expect(r!.cycleYear).toBe(2027);
    expect(r!.groups).toHaveLength(1);
    const g = r!.groups[0]!;
    expect(g).toMatchObject({ program: 'REG', state: 'current', shownCycle: 2027, comparedWith: 2026 });
    const same = g.prompts.find((p) => p.id === 'p1')!;
    expect(same).toMatchObject({
      status: 'same',
      cycles: [2026, 2027],
      limit: { kind: 'WORDS', value: 250 },
      optional: false,
      sources: ['ADMIT', 'SDN'],
      lastCheckedAt: CHECKED.toISOString(),
    });
    const gone = g.prompts.find((p) => p.id === 'p2')!;
    expect(gone).toMatchObject({ status: 'gone', optional: true, limit: { kind: 'CHARS', value: 1500 } });
    // The pinned DTO key set: nothing stored for the engine leaks (key, themesVersion, dedupe, user).
    expect(Object.keys(same).sort()).toEqual(
      [
        'cycles',
        'id',
        'lastCheckedAt',
        'limit',
        'optional',
        'previousText',
        'sources',
        'status',
        'text',
        'themes',
      ].sort(),
    );
    const body = JSON.stringify(r);
    for (const needle of ['themesVersion', 'dedupeHash', 'userId', '"key"']) expect(body).not.toContain(needle);
  });

  it('in July, before any interview, the tab shows the new cycle\'s prompts, not last cycle\'s', async () => {
    f.tables.medSecondaryPrompt.push(prompt('p1', 'Describe a challenge you faced and how you responded to it.'));
    f.tables.medSecondaryObservation.push(obs('p1', 2026), obs('p1', 2027));
    const r = await getSchoolSecondaries('duke', {}, new Date('2026-07-15T12:00:00Z'));
    expect(r!.cycleYear).toBe(2027);
    expect(r!.groups[0]).toMatchObject({ shownCycle: 2027, comparedWith: 2026, state: 'current' });
    expect(r!.groups[0]!.prompts[0]).toMatchObject({ status: 'same', cycles: [2026, 2027] });
  });

  it('one forum sighting does not mark the SDN page\'s other prompts "gone"', async () => {
    const THREAD = 'https://forums.studentdoctor.net/threads/duke-secondaries.1234/';
    f.tables.medSecondaryPrompt.push(
      prompt('p1', 'Describe a challenge you faced and how you responded to it.'),
      prompt('p2', 'Why is our school the right place for your training?'),
      prompt('p3', 'Tell us about a time you worked on a team to solve a problem.'),
    );
    f.tables.medSecondaryObservation.push(
      // The SDN page listed p1 and p2 last cycle; this cycle only a forum thread has said anything (p3).
      obs('p1', 2026, 'SDN', { sourceRef: 'https://www.studentdoctor.net/schools-database/medical-school/essay-questions/DUKE/duke' }),
      obs('p2', 2026, 'SDN', { sourceRef: 'https://www.studentdoctor.net/schools-database/medical-school/essay-questions/DUKE/duke' }),
      obs('p3', 2027, 'SDN', { sourceRef: THREAD }),
    );
    // The SDN page was not read this cycle (the old check is from last year).
    f.tables.medSecondaryCheck.push({ id: 'c1', schoolId: 's1', source: 'SDN', checkedAt: new Date('2026-05-01T00:00:00Z'), status: 'OK', promptCount: 2 });
    const r = await getSchoolSecondaries('duke', {});
    const statuses = Object.fromEntries(r!.groups[0]!.prompts.map((p) => [p.id, p.status]));
    expect(statuses.p1).toBeUndefined();
    expect(statuses.p2).toBeUndefined();
    expect(statuses.p3).toBe('new');
  });

  it('a page that was read this cycle still marks what it dropped', async () => {
    f.tables.medSecondaryPrompt.push(
      prompt('p1', 'Describe a challenge you faced and how you responded to it.'),
      prompt('p2', 'Why is our school the right place for your training?'),
    );
    f.tables.medSecondaryObservation.push(obs('p1', 2026, 'SDN'), obs('p2', 2026, 'SDN'), obs('p1', 2027, 'SDN'));
    f.tables.medSecondaryCheck.push({ id: 'c1', schoolId: 's1', source: 'SDN', checkedAt: CHECKED, status: 'OK', promptCount: 1 });
    const r = await getSchoolSecondaries('duke', {});
    expect(Object.fromEntries(r!.groups[0]!.prompts.map((p) => [p.id, p.status]))).toEqual({ p1: 'same', p2: 'gone' });
  });

  it('filters by program and shows only the programs that have prompts (no empty PHD heading)', async () => {
    f.tables.medSecondaryPrompt.push(
      prompt('p1', 'Describe a challenge you faced and how you responded to it.'),
      prompt('p3', 'Why do you want an MD-PhD and what is your research goal?', { program: 'PHD' }),
    );
    f.tables.medSecondaryObservation.push(obs('p1', 2027), obs('p3', 2027));
    expect((await getSchoolSecondaries('duke', { program: 'ALL' }))!.groups.map((g) => g.program)).toEqual([
      'REG',
      'PHD',
    ]);
    expect((await getSchoolSecondaries('duke', {}))!.groups.map((g) => g.program)).toEqual(['REG', 'PHD']);
    expect((await getSchoolSecondaries('duke', { program: 'PHD' }))!.groups.map((g) => g.program)).toEqual(['PHD']);
    f.tables.medSecondaryPrompt = f.tables.medSecondaryPrompt.filter((p) => (p as { id: string }).id !== 'p1');
    f.tables.medSecondaryObservation = f.tables.medSecondaryObservation.filter(
      (o) => (o as { promptId: string }).promptId !== 'p1',
    );
    expect((await getSchoolSecondaries('duke', {}))!.groups.map((g) => g.program)).toEqual(['PHD']);
  });

  it('shows last cycle as not-yet before this cycle has prompts, every mark last-cycle', async () => {
    f.tables.medSecondaryPrompt.push(prompt('p1', 'Describe a challenge you faced and how you responded to it.'));
    f.tables.medSecondaryObservation.push(obs('p1', 2026));
    const g = (await getSchoolSecondaries('duke', {}))!.groups[0]!;
    expect(g).toMatchObject({ state: 'not-yet', shownCycle: 2026 });
    expect(g.prompts.map((p) => p.status)).toEqual(['last-cycle']);
  });

  it('a school with no prompts has no groups, but still names a source that was checked and found nothing', async () => {
    f.tables.medSecondaryCheck.push({
      id: 'c1',
      schoolId: 's1',
      source: 'ADMIT',
      checkedAt: CHECKED,
      status: 'EMPTY',
      promptCount: 0,
    });
    f.tables.medSchoolAlias.push({ id: 'a1', schoolId: 's1', source: 'ADMIT', sourceKey: 'duke-university' });
    const r = await getSchoolSecondaries('duke', {});
    expect(r!.groups).toEqual([]);
    expect(r!.sources).toEqual([
      {
        source: 'ADMIT',
        url: 'https://med.admit.org/secondary-essays/duke-university',
        checkedAt: CHECKED.toISOString(),
        status: 'EMPTY',
      },
    ]);
  });

  it("links each source to the page it was read on; the school's own is the stored sourceRef", async () => {
    f.tables.medSchoolAlias.push(
      { id: 'a1', schoolId: 's1', source: 'ADMIT', sourceKey: 'duke-university' },
      { id: 'a2', schoolId: 's1', source: 'SDN', sourceKey: 'summary:123/duke-university' },
    );
    f.tables.medSecondaryPrompt.push(prompt('p1', 'Describe a challenge you faced and how you responded to it.'));
    f.tables.medSecondaryObservation.push(
      obs('p1', 2027, 'SCHOOL', { sourceRef: 'https://med.duke.edu/secondary' }),
      obs('p1', 2027, 'ADMIT'),
    );
    const r = await getSchoolSecondaries('duke', {});
    expect(r!.sources.map((s) => [s.source, s.url])).toEqual([
      ['SCHOOL', 'https://med.duke.edu/secondary'],
      ['ADMIT', 'https://med.admit.org/secondary-essays/duke-university'],
    ]);
  });

  it('carries the admissions policy and the turnaround, filtered by program', async () => {
    f.tables.medSchoolAdmissionsPolicy.push(
      {
        id: 'x1',
        schoolId: 's1',
        program: 'PHD',
        rolling: false,
        evidence: 'Set dates.',
        url: 'https://med.duke.edu/a',
        checkedOn: new Date('2026-11-23T00:00:00Z'),
        source: 'SCHOOL',
      },
      {
        id: 'x2',
        schoolId: 's1',
        program: 'REG',
        rolling: true,
        evidence: 'Rolling.',
        url: 'https://med.duke.edu/a',
        checkedOn: new Date('2026-11-23T00:00:00Z'),
        source: 'SCHOOL',
      },
    );
    f.tables.medSecondaryTurnaround.push({
      id: 't1',
      schoolId: 's1',
      program: 'REG',
      asOf: new Date('2026-11-22T00:00:00Z'),
      members: 24,
      p25Days: 5,
      medianDays: 9,
      p75Days: 14,
    });
    const all = await getSchoolSecondaries('duke', {});
    expect(all!.admissions.map((a) => [a.program, a.rolling, a.checkedOn])).toEqual([
      ['REG', true, '2026-11-23'],
      ['PHD', false, '2026-11-23'],
    ]);
    expect(all!.turnaround).toEqual([
      { program: 'REG', members: 24, p25Days: 5, medianDays: 9, p75Days: 14, asOf: '2026-11-22' },
    ]);
    const phd = await getSchoolSecondaries('duke', { program: 'PHD' });
    expect(phd!.admissions.map((a) => a.program)).toEqual(['PHD']);
    expect(phd!.turnaround).toEqual([]);
  });

  it('is null for an unknown, inactive or malformed slug', async () => {
    for (const slug of ['nope', 'gone', 'DUKE', '%00', 'x'.repeat(200)])
      expect(await getSchoolSecondaries(slug, {})).toBeNull();
  });
});
