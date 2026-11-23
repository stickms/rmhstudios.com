import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from '../scrape/test-support';
import { putPrefsBody } from './me-schemas';

const fake = vi.hoisted(() => ({ current: null as null | { prisma: unknown } }));
vi.mock('@/lib/prisma.server', () => ({
  get prisma() {
    return fake.current?.prisma;
  },
}));

import { DEFAULT_PREFS, getPrefs, putPrefs } from './prefs.server';

let f: ReturnType<typeof createFakePrisma>;
beforeEach(() => {
  f = createFakePrisma();
  fake.current = f;
});

describe('prefs', () => {
  it('reads the defaults with no row and does not create one', async () => {
    expect(await getPrefs('a')).toEqual(DEFAULT_PREFS);
    expect(f.tables.medUserPrefs).toHaveLength(0);
  });

  it('stores them, normalised, and reads them back; twice is the same', async () => {
    const i = {
      programFilter: 'PHD',
      degree: 'DO',
      homeState: ' nc ',
      chartCategories: ['REJECTION', 'INTERVIEW', 'INTERVIEW'],
    } as const;
    const first = await putPrefs('a', i);
    expect(first).toEqual({
      programs: ['do-phd'],
      programFilter: 'PHD',
      degree: 'DO',
      homeState: 'NC',
      chartCategories: ['INTERVIEW', 'REJECTION'],
    });
    expect(await putPrefs('a', i)).toEqual(first);
    expect(f.tables.medUserPrefs).toHaveLength(1);
  });

  it('is per user', async () => {
    await putPrefs('a', { programFilter: 'REG', degree: null, homeState: null, chartCategories: [] });
    expect(await getPrefs('b')).toEqual(DEFAULT_PREFS);
  });

  it('reads a stored value it no longer knows as the default, never throwing', async () => {
    f.tables.medUserPrefs.push({
      userId: 'a',
      programFilter: 'GONE',
      degree: 'PhD',
      homeState: 'ZZ',
      chartCategories: ['SUBMITTED', 'HOLD', 'WAITLIST'],
    });
    expect(await getPrefs('a')).toEqual({
      programs: ['md', 'md-phd', 'do', 'do-phd'],
      programFilter: 'ALL',
      degree: null,
      homeState: null,
      chartCategories: ['WAITLIST'],
    });
  });

  it('stores the program set, canonical, and keeps the older columns in step', async () => {
    const put = await putPrefs('a', { programs: ['do-phd', 'md'], homeState: null, chartCategories: [] });
    expect(put).toMatchObject({ programs: ['md', 'do-phd'], programFilter: 'ALL', degree: null });
    expect(f.tables.medUserPrefs[0]).toMatchObject({ programs: ['md', 'do-phd'] });
    const one = await putPrefs('a', { programs: ['md-phd'], homeState: null, chartCategories: [] });
    expect(one).toMatchObject({ programs: ['md-phd'], programFilter: 'PHD', degree: 'MD' });
  });

  it('every program on is stored as no preference and reads back as all four', async () => {
    const all = ['md', 'md-phd', 'do', 'do-phd'] as const;
    const put = await putPrefs('a', { programs: all, homeState: null, chartCategories: [] });
    expect(put.programs).toEqual([...all]);
    expect(f.tables.medUserPrefs[0]).toMatchObject({ programs: [], programFilter: 'ALL', degree: null });
  });

  it('a row written before the program set existed reads through its older columns', async () => {
    f.tables.medUserPrefs.push({
      userId: 'a',
      programFilter: 'PHD',
      degree: 'MD',
      homeState: null,
      chartCategories: [],
    });
    expect((await getPrefs('a')).programs).toEqual(['md-phd']);
  });

  it('the schema rejects what the service would never store', () => {
    const ok = { programFilter: 'ALL', degree: null, homeState: null, chartCategories: [] };
    expect(putPrefsBody.safeParse(ok).success).toBe(true);
    expect(putPrefsBody.safeParse({ programs: ['md', 'do-phd'], homeState: null, chartCategories: [] }).success).toBe(
      true,
    );
    for (const bad of [
      { ...ok, programFilter: 'NONE' },
      { ...ok, degree: 'PhD' },
      { ...ok, homeState: 'ZZ' },
      { ...ok, chartCategories: ['SUBMITTED'] },
      { ...ok, userId: 'u2' },
      { ...ok, programs: [] },
      { ...ok, programs: ['pa'] },
      { ...ok, programs: ['md', 'md', 'do', 'do-phd', 'md-phd'] },
      { programFilter: 'ALL' },
    ]) {
      expect(putPrefsBody.safeParse(bad).success).toBe(false);
    }
  });
});
