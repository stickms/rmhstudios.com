import { describe, it, expect } from 'vitest';
import { stripSearchParams } from '@tanstack/react-router';
import {
  INDEX_SEARCH_DEFAULTS,
  LIVE_SEARCH_DEFAULTS,
  SCHOOL_SEARCH_DEFAULTS,
  parseIndexSearch,
  parseLiveSearch,
  parseSchoolSearch,
} from './search';
import { CHARTED_TYPES } from './public-read';

describe('parseSchoolSearch', () => {
  it('defaults', () => {
    const s = parseSchoolSearch({});
    expect(s.tab).toBe('activity');
    expect(s.program).toBe('ALL');
    expect(s.type).toBe('INTERVIEW');
    expect(s.show).toEqual([...CHARTED_TYPES]);
    expect(s.source).toBeUndefined();
    expect(s.cycle).toBeUndefined();
  });
  it('tab and program', () => {
    expect(parseSchoolSearch({ tab: 'forecast' }).tab).toBe('activity');
    expect(parseSchoolSearch({ tab: 'history' }).tab).toBe('history');
    expect(parseSchoolSearch({ program: 'PHD' }).program).toBe('PHD');
    expect(parseSchoolSearch({ program: 'REG' }).program).toBe('REG');
    expect(parseSchoolSearch({ program: 'x' }).program).toBe('ALL');
  });
  it('show is a filtered, deduped, ordered comma list', () => {
    expect(parseSchoolSearch({ show: 'interview,bogus,INTERVIEW' }).show).toEqual(['INTERVIEW']);
    expect(parseSchoolSearch({ show: 'acceptance,secondary' }).show).toEqual(['SECONDARY', 'ACCEPTANCE']);
    expect(parseSchoolSearch({ show: 'withdrawn' }).show).toEqual([...CHARTED_TYPES]);
    expect(parseSchoolSearch({ show: '' }).show).toEqual([...CHARTED_TYPES]);
    expect(parseSchoolSearch({ show: 7 }).show).toEqual([...CHARTED_TYPES]);
  });
  it('cycle, type, source', () => {
    expect(parseSchoolSearch({ cycle: '2027' }).cycle).toBe(2027);
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
    expect(s.program).toBe('ALL');
  });
  it('keeps good ones', () => {
    expect(parseIndexSearch({ q: ' duke ', state: 'tx', degree: 'DO', program: 'PHD' })).toEqual({
      q: 'duke',
      state: 'TX',
      degree: 'DO',
      program: 'PHD',
    });
    expect(parseIndexSearch({ program: 'NONE' }).program).toBe('ALL');
  });
  it('caps q length', () => {
    expect(parseIndexSearch({ q: 'a'.repeat(10_000) }).q?.length).toBeLessThanOrEqual(100);
  });
});

describe('parseLiveSearch', () => {
  it('defaults and NONE', () => {
    expect(parseLiveSearch({}).program).toBe('ALL');
    expect(parseLiveSearch({ program: 'NONE' }).program).toBe('NONE');
    expect(parseLiveSearch({ program: 'bad' }).program).toBe('ALL');
  });
  it('type, school, degree', () => {
    const s = parseLiveSearch({ type: 'hold', school: 'duke', degree: 'MD' });
    expect(s).toEqual({ type: 'HOLD', school: 'duke', degree: 'MD', program: 'ALL' });
    expect(parseLiveSearch({ school: 'Bad Slug%00', degree: 'PhD', type: 'x' })).toEqual({ program: 'ALL' });
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
  it('index and live drop program=ALL and keep a real choice', () => {
    expect(strip(INDEX_SEARCH_DEFAULTS, parseIndexSearch({}))).toEqual({});
    expect(strip(INDEX_SEARCH_DEFAULTS, parseIndexSearch({ program: 'PHD', q: 'duke' }))).toEqual({
      program: 'PHD',
      q: 'duke',
    });
    expect(strip(LIVE_SEARCH_DEFAULTS, parseLiveSearch({}))).toEqual({});
    expect(strip(LIVE_SEARCH_DEFAULTS, parseLiveSearch({ program: 'NONE' }))).toEqual({ program: 'NONE' });
  });
  it('school drops tab, program, type and the all-five show list, keeps the rest', () => {
    expect(strip(SCHOOL_SEARCH_DEFAULTS, parseSchoolSearch({}))).toEqual({});
    expect(
      strip(SCHOOL_SEARCH_DEFAULTS, parseSchoolSearch({ show: 'secondary,interview,waitlist,rejection,acceptance' })),
    ).toEqual({});
    expect(
      strip(SCHOOL_SEARCH_DEFAULTS, parseSchoolSearch({ tab: 'history', show: 'interview,acceptance', cycle: '2026' })),
    ).toEqual({
      tab: 'history',
      show: ['INTERVIEW', 'ACCEPTANCE'],
      cycle: 2026,
    });
  });
});
