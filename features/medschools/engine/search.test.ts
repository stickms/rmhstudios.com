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
    expect(parseSchoolSearch({ tab: 'forecast' }).tab).toBe('activity');
    expect(parseSchoolSearch({ tab: 'history' }).tab).toBe('history');
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
    const s = parseIndexSearch({ state: 'zz9', degree: 'PhD' });
    expect(s.state).toBeUndefined();
    expect(s.degree).toBeUndefined();
    expect(s.program).toBeUndefined();
  });
  it('degree=ALL is the explicit "every degree" and program=ALL the explicit default', () => {
    expect(parseIndexSearch({ degree: 'ALL' }).degree).toBe('ALL');
    expect(parseIndexSearch({ program: 'ALL' }).program).toBe('ALL');
    expect(parseIndexSearch({}).degree).toBeUndefined();
    expect('program' in parseIndexSearch({})).toBe(false);
    expect(parseLiveSearch({ degree: 'ALL' }).degree).toBe('ALL');
    expect(parseLiveSearch({ program: 'ALL' }).program).toBe('ALL');
  });
  it('keeps good ones', () => {
    expect(parseIndexSearch({ q: ' duke ', state: 'tx', degree: 'DO', program: 'PHD' })).toEqual({
      q: 'duke',
      state: 'TX',
      degree: 'DO',
      program: 'PHD',
    });
    expect(parseIndexSearch({ program: 'NONE' }).program).toBeUndefined();
  });
  it('caps q length', () => {
    expect(parseIndexSearch({ q: 'a'.repeat(10_000) }).q?.length).toBeLessThanOrEqual(100);
  });
});

describe('parseLiveSearch', () => {
  it('defaults and NONE', () => {
    expect(parseLiveSearch({}).program).toBeUndefined();
    expect(parseLiveSearch({ program: 'NONE' }).program).toBe('NONE');
    expect(parseLiveSearch({ program: 'bad' }).program).toBeUndefined();
  });
  it('type, school, degree', () => {
    const s = parseLiveSearch({ type: 'hold', school: 'duke', degree: 'MD' });
    expect(s).toEqual({ type: 'HOLD', school: 'duke', degree: 'MD' });
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
  it('program, degree and show are never stripped: the URL can say "I chose the default" (D14)', () => {
    expect(strip(INDEX_SEARCH_DEFAULTS, parseIndexSearch({}))).toEqual({});
    expect(strip(INDEX_SEARCH_DEFAULTS, parseIndexSearch({ program: 'ALL', degree: 'ALL' }))).toEqual({
      program: 'ALL',
      degree: 'ALL',
    });
    expect(strip(INDEX_SEARCH_DEFAULTS, parseIndexSearch({ program: 'PHD', degree: 'MD', q: 'duke' }))).toEqual({
      degree: 'MD',
      program: 'PHD',
      q: 'duke',
    });
    expect(strip(LIVE_SEARCH_DEFAULTS, parseLiveSearch({}))).toEqual({});
    expect(strip(LIVE_SEARCH_DEFAULTS, parseLiveSearch({ program: 'ALL' }))).toEqual({ program: 'ALL' });
    expect(strip(LIVE_SEARCH_DEFAULTS, parseLiveSearch({ program: 'NONE' }))).toEqual({ program: 'NONE' });
  });
  it('the parsers keep a program without a degree; the effective view (prefs.ts) is what reads it as All', () => {
    expect(parseIndexSearch({ program: 'PHD' }).program).toBe('PHD');
    expect(parseIndexSearch({ program: 'PHD', degree: 'DO' }).program).toBe('PHD');
    expect(parseLiveSearch({ program: 'REG' }).program).toBe('REG');
    expect(parseLiveSearch({ program: 'NONE' }).program).toBe('NONE');
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
