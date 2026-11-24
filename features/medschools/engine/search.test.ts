import { describe, it, expect } from 'vitest';
import { stripSearchParams } from '@tanstack/react-router';
import {
  INDEX_SEARCH_DEFAULTS,
  LIVE_SEARCH_DEFAULTS,
  SCHOOL_SEARCH_DEFAULTS,
  parseIndexSearch,
  parseLiveSearch,
  parseSchoolSearch,
  parseTrackerSearch,
  showParam,
  validateIndexSearch,
  validateLiveSearch,
  validateSchoolSearch,
} from './search';
import { CHARTED_TYPES } from './public-read';

describe('parseSchoolSearch', () => {
  it('defaults', () => {
    const s = parseSchoolSearch({});
    expect(s.tab).toBe('activity');
    // Absent stays absent (D14): a preference may fill it; the page's effective view says All.
    expect(s.program).toBeUndefined();
    expect('program' in s).toBe(false);
    expect(s.type).toBe('INTERVIEW');
    expect(s.show).toBeUndefined();
    expect('show' in s).toBe(false);
    expect(s.source).toBeUndefined();
    expect(s.cycle).toBeUndefined();
  });
  it('tab and program', () => {
    expect(parseSchoolSearch({ tab: 'forecast' }).tab).toBe('forecast');
    expect(parseSchoolSearch({ tab: 'nonsense' }).tab).toBe('activity');
    expect(parseSchoolSearch({ tab: 'history' }).tab).toBe('history');
    expect(parseSchoolSearch({ tab: 'secondaries' }).tab).toBe('secondaries');
    expect(parseSchoolSearch({ program: 'PHD' }).program).toBe('PHD');
    expect(parseSchoolSearch({ program: 'REG' }).program).toBe('REG');
    expect(parseSchoolSearch({ program: 'x' }).program).toBeUndefined();
    expect(parseSchoolSearch({ program: 'all' }).program).toBe('ALL'); // the explicit default is kept (Review Focus 9)
  });
  it('show is a filtered, deduped, ordered comma list', () => {
    expect(parseSchoolSearch({ show: 'interview,bogus,INTERVIEW' }).show).toEqual(['INTERVIEW']);
    expect(parseSchoolSearch({ show: 'acceptance,secondary' }).show).toEqual(['SECONDARY', 'ACCEPTANCE']);
    // Empty or unknown is silent (a preference may fill it), not "all five".
    expect(parseSchoolSearch({ show: 'withdrawn' }).show).toBeUndefined();
    expect(parseSchoolSearch({ show: '' }).show).toBeUndefined();
    expect(parseSchoolSearch({ show: 7 }).show).toBeUndefined();
    expect(parseSchoolSearch({ show: 'interview,secondary,waitlist,rejection,acceptance' }).show).toEqual([
      ...CHARTED_TYPES,
    ]);
  });
  it('daily is a list of categories in canonical order; a single value still parses; absent is every category', () => {
    expect(parseSchoolSearch({ daily: 'interview' }).daily).toEqual(['INTERVIEW']);
    expect(parseSchoolSearch({ daily: 'ACCEPTANCE,interview,bogus' }).daily).toEqual(['INTERVIEW', 'ACCEPTANCE']);
    expect('daily' in parseSchoolSearch({})).toBe(false);
    expect('daily' in parseSchoolSearch({ daily: 'hold' })).toBe(false);
    expect(validateSchoolSearch({ daily: 'acceptance,secondary' }).daily).toBe('secondary,acceptance');
    // All five is the default, so the canonical URL drops it.
    expect('daily' in validateSchoolSearch({ daily: CHARTED_TYPES.join(',') })).toBe(false);
    // The old single-category `type` link still parses, for the cumulative chart and the other tabs.
    expect(parseSchoolSearch({ type: 'rejection', daily: 'rejection' })).toMatchObject({
      type: 'REJECTION',
      daily: ['REJECTION'],
    });
  });
  it('cycle, type, source', () => {
    expect(parseSchoolSearch({ cycle: '2027' }).cycle).toBe(2027);
    expect(parseSchoolSearch({ cycle: 2027 }).cycle).toBe(2027); // the router parses ?cycle=2027 into a number
    expect(parseSchoolSearch({ cycle: 'abc' }).cycle).toBeUndefined();
    expect(parseSchoolSearch({ type: 'waitlist' }).type).toBe('WAITLIST');
    expect(parseSchoolSearch({ type: 'hold' }).type).toBe('INTERVIEW');
    expect(parseSchoolSearch({ source: 'sdn' }).source).toBe('SDN');
    expect(parseSchoolSearch({ source: 'nope' }).source).toBeUndefined();
  });
});

describe('parseIndexSearch', () => {
  it('drops malformed values', () => {
    const s = parseIndexSearch({ state: 'zz9', degree: 'PhD', programs: 'pa,np', list: 'Bad Id!' });
    expect(s).toEqual({});
  });
  it('programs is a comma list in canonical order; all four is a choice, not silence', () => {
    expect(parseIndexSearch({ programs: 'do-phd,MD' }).programs).toEqual(['md', 'do-phd']);
    expect(parseIndexSearch({ programs: 'all' }).programs).toEqual(['md', 'md-phd', 'do', 'do-phd']);
    expect('programs' in parseIndexSearch({})).toBe(false);
  });
  it('the old degree and program parameters still work, mapped onto the set', () => {
    expect(parseIndexSearch({ degree: 'MD', program: 'PHD' }).programs).toEqual(['md-phd']);
    expect(parseIndexSearch({ degree: 'DO' }).programs).toEqual(['do', 'do-phd']);
    expect(parseIndexSearch({ program: 'REG' }).programs).toEqual(['md', 'do']);
    expect(parseIndexSearch({ degree: 'ALL', program: 'ALL' }).programs).toHaveLength(4);
    expect(parseIndexSearch({ programs: 'do', degree: 'MD' }).programs).toEqual(['do']); // the new key wins
    expect(parseLiveSearch({ degree: 'MD' }).programs).toEqual(['md', 'md-phd']);
  });
  it('keeps good ones, and a list id or all', () => {
    expect(parseIndexSearch({ q: ' duke ', state: 'tx', programs: 'do-phd', list: 'all' })).toEqual({
      q: 'duke',
      state: 'TX',
      programs: ['do-phd'],
      list: 'all',
    });
    expect(parseIndexSearch({ list: 'cmabc123' }).list).toBe('cmabc123');
  });
  it('the route validator writes the program set back as the comma list, never an array', () => {
    expect(validateIndexSearch({ programs: 'do,md-phd', q: 'x' })).toEqual({ q: 'x', programs: 'md-phd,do' });
    expect(validateLiveSearch({ degree: 'DO', program: 'PHD' })).toEqual({ programs: 'do-phd' });
  });
  it('caps q length', () => {
    expect(parseIndexSearch({ q: 'a'.repeat(10_000) }).q?.length).toBeLessThanOrEqual(100);
  });
});

describe('parseLiveSearch', () => {
  it('defaults', () => {
    expect(parseLiveSearch({})).toEqual({});
    expect(parseLiveSearch({ program: 'bad' })).toEqual({});
  });
  it('type, school, programs', () => {
    const s = parseLiveSearch({ type: 'hold', school: 'duke', programs: 'md' });
    expect(s).toEqual({ type: 'HOLD', school: 'duke', programs: ['md'] });
    expect(parseLiveSearch({ school: 'Bad Slug%00', degree: 'PhD', type: 'x' })).toEqual({});
  });
});

describe('defaults stay out of the URL (stripSearchParams)', () => {
  const strip = (defaults: object, search: Record<string, unknown>) =>
    (
      stripSearchParams(defaults as never) as unknown as (a: {
        search: unknown;
        next: (s: unknown) => unknown;
      }) => unknown
    )({
      search,
      next: (s) => s,
    });
  it('programs is never stripped: the URL can say "I chose every program" (D14)', () => {
    expect(strip(INDEX_SEARCH_DEFAULTS, validateIndexSearch({}))).toEqual({});
    expect(strip(INDEX_SEARCH_DEFAULTS, validateIndexSearch({ programs: 'all' }))).toEqual({
      programs: 'md,md-phd,do,do-phd',
    });
    expect(strip(LIVE_SEARCH_DEFAULTS, validateLiveSearch({}))).toEqual({});
    expect(strip(LIVE_SEARCH_DEFAULTS, validateLiveSearch({ programs: 'md' }))).toEqual({ programs: 'md' });
  });
  it('the school parser keeps a program as a choice', () => {
    expect(parseSchoolSearch({ program: 'PHD' }).program).toBe('PHD');
  });
  it('limits match the API: q 80 characters, cycle 2000-2100', () => {
    expect(parseIndexSearch({ q: 'a'.repeat(200) }).q).toHaveLength(80);
    expect(parseSchoolSearch({ cycle: '1999' }).cycle).toBeUndefined();
    expect(parseSchoolSearch({ cycle: '2101' }).cycle).toBeUndefined();
    expect(parseSchoolSearch({ cycle: '2100' }).cycle).toBe(2100);
  });
  it('school drops tab and type defaults, keeps program, show and the rest', () => {
    expect(strip(SCHOOL_SEARCH_DEFAULTS, validateSchoolSearch({}))).toEqual({});
    expect(strip(SCHOOL_SEARCH_DEFAULTS, validateSchoolSearch({ program: 'ALL' }))).toEqual({ program: 'ALL' });
    expect(
      strip(
        SCHOOL_SEARCH_DEFAULTS,
        validateSchoolSearch({ show: 'secondary,interview,waitlist,rejection,acceptance' }),
      ),
    ).toEqual({ show: showParam(CHARTED_TYPES) });
    expect(
      strip(
        SCHOOL_SEARCH_DEFAULTS,
        validateSchoolSearch({ tab: 'history', show: 'interview,acceptance', cycle: '2026' }),
      ),
    ).toEqual({ tab: 'history', show: 'interview,acceptance', cycle: 2026 });
  });
});

describe('validateSchoolSearch', () => {
  it('keeps show as a lowercase comma list in CHARTED_TYPES order, so a link reads back', () => {
    const v = validateSchoolSearch({ show: 'ACCEPTANCE,interview' });
    expect(v.show).toBe('interview,acceptance');
    expect(parseSchoolSearch(v).show).toEqual(['INTERVIEW', 'ACCEPTANCE']);
    expect(showParam(CHARTED_TYPES)).toBe('interview,secondary,waitlist,rejection,acceptance');
  });
  it('leaves show out for an empty or unknown list (silent: a preference may fill it)', () => {
    expect('show' in validateSchoolSearch({ show: 'x' })).toBe(false);
    expect('show' in validateSchoolSearch({})).toBe(false);
  });
});

describe('parseTrackerSearch', () => {
  it('keeps a sane cycle year, from the router parsing ?cycle=2027 into a number or a string', () => {
    expect(parseTrackerSearch({ cycle: 2027 })).toEqual({ cycle: 2027 });
    expect(parseTrackerSearch({ cycle: '2027' })).toEqual({ cycle: 2027 });
  });
  it('drops everything else', () => {
    expect(parseTrackerSearch({})).toEqual({});
    expect(parseTrackerSearch({ cycle: 'x' })).toEqual({});
    expect(parseTrackerSearch({ cycle: 1999 })).toEqual({});
    expect(parseTrackerSearch({ cycle: 20270 })).toEqual({});
    expect(parseTrackerSearch({ cycle: ['2027'] })).toEqual({});
  });
});
