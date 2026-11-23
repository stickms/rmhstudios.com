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
      programFilter: 'ALL',
      degree: null,
      homeState: null,
      chartCategories: ['WAITLIST'],
    });
  });

  it('the schema rejects what the service would never store', () => {
    const ok = { programFilter: 'ALL', degree: null, homeState: null, chartCategories: [] };
    expect(putPrefsBody.safeParse(ok).success).toBe(true);
    for (const bad of [
      { ...ok, programFilter: 'NONE' },
      { ...ok, degree: 'PhD' },
      { ...ok, homeState: 'ZZ' },
      { ...ok, chartCategories: ['SUBMITTED'] },
      { ...ok, userId: 'u2' },
      { programFilter: 'ALL' },
    ]) {
      expect(putPrefsBody.safeParse(bad).success).toBe(false);
    }
  });
});
