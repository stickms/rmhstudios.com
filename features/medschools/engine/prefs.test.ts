import { describe, expect, it } from 'vitest';
import { applyPrefs, patchSearch, resolveView, writeSearch, type EffectiveView, type Prefs } from './prefs';
import { CHARTED_TYPES } from './public-read';

const ALL = ['md', 'md-phd', 'do', 'do-phd'] as const;
const prefs = (over: Partial<Prefs> = {}): Prefs => ({
  programs: ['md-phd'],
  programFilter: 'PHD',
  degree: 'MD',
  homeState: null,
  chartCategories: [],
  ...over,
});
const none: Prefs = { programs: [...ALL], programFilter: 'ALL', degree: null, homeState: null, chartCategories: [] };
const view = (o: Partial<EffectiveView> = {}): EffectiveView => ({
  programs: [...ALL],
  program: 'ALL',
  show: [...CHARTED_TYPES],
  fromPrefs: false,
  fromDevice: false,
  ...o,
});

describe('applyPrefs: the URL beats a preference, including the explicit default', () => {
  it('fills a silent URL from the preferences', () => {
    expect(applyPrefs('index', {}, prefs())).toMatchObject({ programs: ['md-phd'], fromPrefs: true });
    expect(applyPrefs('live', {}, prefs())).toMatchObject({ programs: ['md-phd'], fromPrefs: true });
  });

  it('all four programs in the URL is a choice and beats a preference', () => {
    const v = applyPrefs('index', { programs: [...ALL] }, prefs());
    expect(v.programs).toEqual([...ALL]);
    expect(v.fromPrefs).toBe(false);
  });

  it('a program set in the URL replaces the preference whole', () => {
    expect(applyPrefs('index', { programs: ['do'] }, prefs())).toMatchObject({ programs: ['do'], fromPrefs: false });
  });

  it('a school page reads the preferred set through its own degree', () => {
    const p = prefs({ programs: ['md-phd', 'do'] });
    expect(applyPrefs('school', {}, p, { schoolDegree: 'MD' })).toMatchObject({ program: 'PHD', fromPrefs: true });
    expect(applyPrefs('school', {}, p, { schoolDegree: 'DO' })).toMatchObject({ program: 'REG', fromPrefs: true });
  });

  it('a school page whose degree the preference does not mention shows All', () => {
    const v = applyPrefs('school', {}, prefs({ programs: ['do'] }), { schoolDegree: 'MD' });
    expect(v.program).toBe('ALL');
    expect(v.fromPrefs).toBe(false);
  });

  it('?program= on a school page is a choice, including ALL', () => {
    const v = applyPrefs('school', { program: 'ALL' }, prefs(), { schoolDegree: 'MD' });
    expect(v.program).toBe('ALL');
    expect(v.fromPrefs).toBe(false);
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
      expect(applyPrefs('index', {}, p)).toEqual(view());
    }
    expect(applyPrefs('school', {}, undefined, { schoolDegree: 'DO' })).toEqual(view());
  });

  it('a row with no program set reads through its older columns', () => {
    const old = { programs: [], programFilter: 'PHD', degree: 'DO', homeState: null, chartCategories: [] } as Prefs;
    expect(applyPrefs('index', {}, old).programs).toEqual(['do-phd']);
  });

  it('a default-valued preference is not "from prefs"', () => {
    expect(applyPrefs('index', {}, none).fromPrefs).toBe(false);
  });

  it('an unknown stored value falls to the default and never throws', () => {
    const bad = {
      programs: ['pa', 7],
      programFilter: 'X',
      degree: 'PA',
      homeState: null,
      chartCategories: ['NOPE', 7],
    } as unknown as Prefs;
    expect(applyPrefs('index', {}, bad)).toEqual(view());
    expect(applyPrefs('school', {}, bad).show).toEqual([...CHARTED_TYPES]);
  });

  it('resolveView is the same function', () => {
    expect(resolveView('index', {}, prefs())).toEqual(applyPrefs('index', {}, prefs()));
  });
});

describe('writeSearch (D14)', () => {
  it('without preferences it writes exactly the clean URLs', () => {
    expect(writeSearch('index', view(), null)).toEqual({});
    expect(writeSearch('school', view(), none)).toEqual({});
    expect(writeSearch('live', view({ programs: ['md', 'do'] }), undefined)).toEqual({ programs: 'md,do' });
  });

  it('with a program preference, every program on is written too, so the link says what it means', () => {
    expect(writeSearch('index', view(), prefs())).toEqual({ programs: 'md,md-phd,do,do-phd' });
    expect(writeSearch('index', view({ programs: ['md-phd'], fromPrefs: true }), prefs())).toEqual({
      programs: 'md-phd',
    });
  });

  it('a school page writes its program when it is not All or a preference would override it, and show likewise', () => {
    const p = prefs({ chartCategories: ['INTERVIEW'] });
    expect(writeSearch('school', view({ program: 'PHD', show: ['INTERVIEW'] }), p)).toEqual({
      program: 'PHD',
      show: 'interview',
    });
    expect(writeSearch('school', view(), p)).toEqual({
      program: 'ALL',
      show: 'interview,secondary,waitlist,rejection,acceptance',
    });
  });
});

describe('patchSearch: only the keys the viewer changed are rewritten', () => {
  it('keeps the page-owned keys and untouched keys as the URL had them', () => {
    const prev = { q: 'duke', state: 'NC', programs: 'md' };
    expect(patchSearch('index', prev, view({ programs: ['md'] }), { programs: ['md', 'do'] }, null)).toEqual({
      q: 'duke',
      state: 'NC',
      programs: 'md,do',
    });
  });

  it('a default that came from a preference is not frozen into the URL by an unrelated change', () => {
    const v = view({ programs: ['md-phd'], fromPrefs: true });
    expect(patchSearch('index', { q: 'x' }, v, {}, prefs())).toEqual({ q: 'x' });
  });

  it('turning every program back on with a preference writes the full list; with none, the key is dropped', () => {
    const v = view({ programs: ['md-phd'] });
    expect(patchSearch('index', { programs: 'md-phd' }, v, { programs: [...ALL] }, prefs())).toEqual({
      programs: 'md,md-phd,do,do-phd',
    });
    expect(patchSearch('index', { programs: 'md-phd' }, v, { programs: [...ALL] }, null)).toEqual({});
  });

  it('changing the program set drops a legacy degree and program from the address', () => {
    expect(patchSearch('index', { degree: 'MD', program: 'PHD', q: 'x' }, view(), { programs: ['do'] }, null)).toEqual({
      q: 'x',
      programs: 'do',
    });
  });

  it('school: show is written as the lowercase list and dropped when it is every category', () => {
    expect(patchSearch('school', { tab: 'activity' }, view(), { show: ['INTERVIEW', 'ACCEPTANCE'] }, null)).toEqual({
      tab: 'activity',
      show: 'interview,acceptance',
    });
    expect(patchSearch('school', { show: 'interview' }, view(), { show: [...CHARTED_TYPES] }, null)).toEqual({});
  });
});
