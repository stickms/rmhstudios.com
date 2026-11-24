import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  medSchool: { findFirst: vi.fn(async (..._a: unknown[]): Promise<unknown> => null) },
  medSchoolFact: { findMany: vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []) },
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: m }));

import { classProfilesOf, getSchoolFacts } from './school-facts.server';

const day = new Date('2026-11-24T00:00:00Z');
const row = (kind: string, cycleYear: number, text: string, over: Record<string, unknown> = {}) => ({
  kind,
  program: 'REG',
  cycleYear,
  valueText: text,
  valueNum: null,
  sourceUrl: 'https://alpha.edu/class-profile',
  checkedOn: day,
  ...over,
  valueJson: {
    text,
    label: cycleYear === 0 ? 'Current class' : `Entering class ${cycleYear}`,
    qualifier: null,
    evidence: `Figure ${text}`,
    url: 'https://alpha.edu/class-profile',
    unit: null,
    order: 0,
    ...((over.valueJson as object | undefined) ?? {}),
  },
});

describe('classProfilesOf', () => {
  it('groups the figures by class, in the page order, newest class first, an undated class ahead', () => {
    const out = classProfilesOf([
      row('PROFILE_MCAT_MEDIAN', 2025, '516'),
      row('PROFILE_APPLICANTS', 2026, '7,412', { valueNum: 7412, valueJson: { order: 1 } }),
      row('PROFILE_MCAT_MEDIAN', 2026, '517', { valueJson: { order: 0 } }),
      row('PROFILE_OTHER#2', 2026, '31%', { valueJson: { order: 3, qualifier: 'rural' } }),
      row('PROFILE_OTHER', 2026, '22%', { valueJson: { order: 2, qualifier: 'first generation' } }),
      row('PROFILE_GPA_MEAN', 0, '3.81'),
    ]);
    expect(out.map((c) => [c.label, c.enteringYear])).toEqual([
      ['Current class', null],
      ['Entering class 2026', 2026],
      ['Entering class 2025', 2025],
    ]);
    expect(out[1]!.stats.map((s) => `${s.kind}:${s.value}`)).toEqual([
      'MCAT_MEDIAN:517',
      'APPLICANTS:7,412',
      'OTHER:22%',
      'OTHER:31%',
    ]);
    expect(out[1]!.stats[1]).toEqual({
      kind: 'APPLICANTS',
      program: 'REG',
      value: '7,412',
      num: 7412,
      qualifier: null,
      evidence: 'Figure 7,412',
    });
    expect(out[1]).toMatchObject({ url: 'https://alpha.edu/class-profile', checkedOn: '2026-11-24' });
  });

  it('drops a row whose kind is not in the profile catalogue or that lacks its words, never guessing', () => {
    const out = classProfilesOf([
      row('PROFILE_ACCEPTANCE_RATE', 2026, '4%'),
      row('ACCEPTS_OUT_OF_STATE', 2026, 'YES'),
      row('PROFILE_MCAT_MEAN', 2026, '511', { valueJson: { evidence: '' } }),
      row('PROFILE_GPA_MEAN', 2026, '3.8', { program: 'OTHER' }),
    ]);
    expect(out).toEqual([]);
  });

  it('keeps an MD-PhD figure in its class, marked PHD', () => {
    const out = classProfilesOf([row('PROFILE_APPLICANTS', 2026, '562', { program: 'PHD' })]);
    expect(out[0]!.stats[0]).toMatchObject({ kind: 'APPLICANTS', program: 'PHD', value: '562' });
  });
});

describe('getSchoolFacts', () => {
  beforeEach(() => {
    m.medSchool.findFirst.mockReset();
    m.medSchoolFact.findMany.mockReset();
  });

  it('serves the profile classes beside the facts; the REG facts query never reads profile rows', async () => {
    m.medSchool.findFirst.mockResolvedValue({ id: 's1' });
    m.medSchoolFact.findMany.mockImplementation(async (args: unknown) => {
      const where = (args as { where: { source?: unknown } }).where;
      return where.source === 'SCHOOL_PROFILE' ? [row('PROFILE_MCAT_MEDIAN', 2026, '517')] : [];
    });
    const res = await getSchoolFacts('alpha');
    expect(Object.keys(res!).sort()).toEqual(['classes', 'facts', 'mdphd', 'pageUrl']);
    expect(res!.facts).toEqual([]);
    expect(res!.classes).toHaveLength(1);
    expect(res!.classes[0]!.stats[0]!.value).toBe('517');
    const wheres = m.medSchoolFact.findMany.mock.calls.map((c) => (c[0] as { where: Record<string, unknown> }).where);
    expect(wheres[0]).toMatchObject({ schoolId: 's1', program: 'REG', source: { not: 'SCHOOL_PROFILE' } });
    expect(wheres[2]).toMatchObject({ schoolId: 's1', source: 'SCHOOL_PROFILE', kind: { startsWith: 'PROFILE_' } });
  });

  it('gives a school with no profile an empty list', async () => {
    m.medSchool.findFirst.mockResolvedValue({ id: 's1' });
    m.medSchoolFact.findMany.mockResolvedValue([]);
    expect((await getSchoolFacts('alpha'))!.classes).toEqual([]);
  });
});
