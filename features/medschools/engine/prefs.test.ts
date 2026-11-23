import { describe, expect, it } from 'vitest';
import { applyPrefs, writeSearch, type Prefs } from './prefs';
import { CHARTED_TYPES } from './public-read';

const prefs = (over: Partial<Prefs> = {}): Prefs => ({
  programFilter: 'PHD',
  degree: 'MD',
  homeState: null,
  chartCategories: [],
  ...over,
});
const none: Prefs = { programFilter: 'ALL', degree: null, homeState: null, chartCategories: [] };

describe('applyPrefs: the URL beats a preference, including the explicit default', () => {
  it('fills a silent URL from the preferences', () => {
    expect(applyPrefs('index', {}, prefs())).toMatchObject({ degree: 'MD', program: 'PHD', fromPrefs: true });
    expect(applyPrefs('live', {}, prefs())).toMatchObject({ degree: 'MD', program: 'PHD', fromPrefs: true });
  });

  it('?program=ALL with a PHD preference is All', () => {
    const v = applyPrefs('index', { program: 'ALL' }, prefs({ degree: null }));
    expect(v.program).toBe('ALL');
    expect(v.fromPrefs).toBe(false);
  });

  it('program is degree-neutral: ?degree=DO with no program takes the PHD preference', () => {
    expect(applyPrefs('index', { degree: 'DO' }, prefs())).toMatchObject({
      degree: 'DO',
      program: 'PHD',
      fromPrefs: true,
    });
  });

  it('?degree=ALL is an explicit "no degree" against a degree preference', () => {
    const v = applyPrefs('index', { degree: 'ALL' }, prefs({ programFilter: 'ALL' }));
    expect(v.degree).toBeUndefined();
    expect(v.fromPrefs).toBe(false);
  });

  it('a school page keeps its own degree and ignores the degree preference', () => {
    const v = applyPrefs('school', {}, prefs({ degree: 'DO' }), { schoolDegree: 'MD' });
    expect(v.degree).toBe('MD');
    expect(v.program).toBe('PHD');
  });

  it('?show= falls to the preference, then to all five', () => {
    const p = prefs({ chartCategories: ['ACCEPTANCE', 'INTERVIEW'] });
    expect(applyPrefs('school', { show: [] }, p).show).toEqual(['INTERVIEW', 'ACCEPTANCE']);
    expect(applyPrefs('school', {}, p).show).toEqual(['INTERVIEW', 'ACCEPTANCE']);
    expect(applyPrefs('school', {}, p).fromPrefs).toBe(true);
    expect(applyPrefs('school', { show: [] }, prefs()).show).toEqual([...CHARTED_TYPES]);
    expect(applyPrefs('school', { show: ['WAITLIST'] }, p).show).toEqual(['WAITLIST']);
  });

  it('a preference of types the chart does not draw falls to all five', () => {
    expect(applyPrefs('school', {}, prefs({ chartCategories: ['HOLD', 'WITHDRAWN'] })).show).toEqual([
      ...CHARTED_TYPES,
    ]);
  });

  it('null and undefined preferences give the phase 3 defaults', () => {
    for (const p of [null, undefined]) {
      expect(applyPrefs('index', {}, p)).toEqual({ program: 'ALL', show: [...CHARTED_TYPES], fromPrefs: false });
    }
    expect(applyPrefs('school', {}, undefined, { schoolDegree: 'DO' })).toEqual({
      degree: 'DO',
      program: 'ALL',
      show: [...CHARTED_TYPES],
      fromPrefs: false,
    });
  });

  it('a default-valued preference is not "from prefs"', () => {
    expect(applyPrefs('index', {}, none).fromPrefs).toBe(false);
  });

  it('an unknown stored value falls to the default and never throws', () => {
    const bad = { programFilter: 'X', degree: 'PA', homeState: null, chartCategories: ['NOPE', 7] } as unknown as Prefs;
    expect(applyPrefs('index', {}, bad)).toEqual({ program: 'ALL', show: [...CHARTED_TYPES], fromPrefs: false });
    expect(applyPrefs('school', {}, bad).show).toEqual([...CHARTED_TYPES]);
  });

  it("the live page's NONE program is explicit and kept", () => {
    expect(applyPrefs('live', { program: 'NONE' }, prefs()).program).toBe('NONE');
  });
});

describe('writeSearch (D14)', () => {
  it('without preferences it writes exactly the URLs phase 3 wrote', () => {
    expect(writeSearch('index', { program: 'ALL', show: [...CHARTED_TYPES], fromPrefs: false }, null)).toEqual({});
    expect(
      writeSearch('index', { degree: 'MD', program: 'ALL', show: [...CHARTED_TYPES], fromPrefs: false }, undefined),
    ).toEqual({
      degree: 'MD',
    });
    expect(writeSearch('school', { program: 'ALL', show: [...CHARTED_TYPES], fromPrefs: false }, none)).toEqual({});
  });

  it('with a PHD preference, All is written and so is PHD', () => {
    expect(
      writeSearch('index', { program: 'ALL', show: [...CHARTED_TYPES], fromPrefs: false }, prefs({ degree: null })),
    ).toEqual({
      program: 'ALL',
    });
    expect(
      writeSearch('index', { program: 'PHD', show: [...CHARTED_TYPES], fromPrefs: true }, prefs({ degree: null })),
    ).toEqual({
      program: 'PHD',
    });
  });

  it('with a degree preference, the degree is written; "no degree" is written as ALL', () => {
    expect(
      writeSearch(
        'index',
        { degree: 'MD', program: 'ALL', show: [], fromPrefs: true },
        prefs({ programFilter: 'ALL' }),
      ),
    ).toEqual({
      degree: 'MD',
    });
    expect(
      writeSearch('index', { program: 'ALL', show: [], fromPrefs: false }, prefs({ programFilter: 'ALL' })),
    ).toEqual({
      degree: 'ALL',
    });
  });

  it('a school page never writes a degree; show is written when a preference would override the default', () => {
    const p = prefs({ chartCategories: ['INTERVIEW'] });
    expect(writeSearch('school', { degree: 'MD', program: 'PHD', show: ['INTERVIEW'], fromPrefs: true }, p)).toEqual({
      program: 'PHD',
      show: 'interview',
    });
    expect(writeSearch('school', { program: 'ALL', show: [...CHARTED_TYPES], fromPrefs: false }, p)).toEqual({
      program: 'ALL',
      show: 'interview,secondary,waitlist,rejection,acceptance',
    });
  });

  it('a shared link never depends on the recipient: every non-default view value is written', () => {
    const w = writeSearch('live', { degree: 'DO', program: 'NONE', show: [], fromPrefs: false }, null);
    expect(w).toEqual({ degree: 'DO', program: 'NONE' });
  });
});
