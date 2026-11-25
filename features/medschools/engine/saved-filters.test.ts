import { describe, expect, it } from 'vitest';
import { applyPrefs, type Prefs } from './prefs';
import {
  clearScope,
  parseSavedFilters,
  pickFilter,
  serializeSavedFilters,
  updateSaved,
  type SavedFilters,
} from './saved-filters';

const prefs = (programs: Prefs['programs']): Prefs => ({
  programs,
  programFilter: 'ALL',
  degree: null,
  homeState: null,
  chartCategories: [],
});

describe('pickFilter: URL > this device > preferences > default (owner 2026-11-24)', () => {
  it('takes the first level that speaks', () => {
    expect(pickFilter('u', 'd', 'p', 'x')).toEqual({ value: 'u', from: 'url' });
    expect(pickFilter(undefined, 'd', 'p', 'x')).toEqual({ value: 'd', from: 'device' });
    expect(pickFilter(undefined, undefined, 'p', 'x')).toEqual({ value: 'p', from: 'prefs' });
    expect(pickFilter(undefined, undefined, undefined, 'x')).toEqual({ value: 'x', from: 'default' });
  });
  it('a null URL value is an explicit choice ("All schools"), not silence', () => {
    expect(pickFilter<string | null>(null, 'd', undefined, null)).toEqual({ value: null, from: 'url' });
  });
});

describe('the program set through applyPrefs (index and live)', () => {
  it('URL beats device beats preferences beats every program', () => {
    expect(applyPrefs('index', { programs: ['do'] }, prefs(['md-phd']), {}, { programs: ['md'] })).toMatchObject({
      programs: ['do'],
      fromDevice: false,
      fromPrefs: false,
    });
    expect(applyPrefs('index', {}, prefs(['md-phd']), {}, { programs: ['md'] })).toMatchObject({
      programs: ['md'],
      fromDevice: true,
      fromPrefs: false,
    });
    expect(applyPrefs('live', {}, prefs(['md-phd']), {}, {})).toMatchObject({
      programs: ['md-phd'],
      fromDevice: false,
      fromPrefs: true,
    });
    expect(applyPrefs('live', {}, null, {}, {})).toMatchObject({
      programs: ['md', 'md-phd', 'do', 'do-phd'],
      fromDevice: false,
      fromPrefs: false,
    });
  });
  it('the school page never reads the device set', () => {
    expect(applyPrefs('school', {}, null, { schoolDegree: 'MD' }, { programs: ['md-phd'] })).toMatchObject({
      program: 'ALL',
      fromDevice: false,
    });
  });
});

describe('the stored value', () => {
  it('reads nothing, junk and foreign shapes as nothing saved, and never throws', () => {
    for (const raw of [null, '', 'not json', '42', '"x"', '[]', '{"page":5}', '{"page":{"programs":"md"}}'])
      expect(parseSavedFilters(raw), String(raw)).toEqual({});
  });
  it('keeps only valid values: known programs, known states (sorted, at most ten), real types, a known choice', () => {
    const raw = JSON.stringify({
      page: { programs: ['do', 'nope', 'md'], states: ['NY', 'ZZ', 'CA', 'CA'], mine: 'list:abc123' },
      rail: { types: ['ACCEPTANCE', 'BOGUS'], mine: 'list:Bad-Id' },
    });
    expect(parseSavedFilters(raw)).toEqual({
      page: { programs: ['md', 'do'], states: ['CA', 'NY'], mine: 'list:abc123' },
      rail: { types: ['ACCEPTANCE'] },
    });
    const many = JSON.stringify({ page: { states: 'AL AK AZ AR CA CO CT DE FL GA HI'.split(' ') } });
    expect(parseSavedFilters(many).page?.states).toHaveLength(10);
  });
  it('never stores the default: all four programs or every type reads as nothing', () => {
    const raw = JSON.stringify({
      page: { programs: ['md', 'md-phd', 'do', 'do-phd'] },
      rail: { types: ['INTERVIEW', 'SECONDARY', 'ACCEPTANCE', 'WAITLIST', 'REJECTION', 'HOLD', 'WITHDRAWN'] },
    });
    expect(parseSavedFilters(raw)).toEqual({});
    expect(serializeSavedFilters(parseSavedFilters(raw))).toBeNull();
  });
});

describe('updateSaved: a change saves, "all" forgets', () => {
  const start: SavedFilters = { page: { programs: ['md'], states: ['CA'] }, rail: { programs: ['do'] } };
  it('saves the named key and keeps the rest', () => {
    expect(updateSaved(start, 'page', { states: ['NY', 'TX'] })).toEqual({
      page: { programs: ['md'], states: ['NY', 'TX'] },
      rail: { programs: ['do'] },
    });
    expect(updateSaved({}, 'page', { mine: { kind: 'cycle' } })).toEqual({ page: { mine: 'cycle' } });
  });
  it('all programs, no states, every type and "All schools" each clear their key', () => {
    let f = updateSaved(start, 'page', { programs: ['md', 'md-phd', 'do', 'do-phd'] });
    expect(f.page).toEqual({ states: ['CA'] });
    f = updateSaved(f, 'page', { states: [] });
    expect(f.page).toBeUndefined();
    const withMine = updateSaved({}, 'rail', { mine: { kind: 'list', id: 'abc' } });
    expect(updateSaved(withMine, 'rail', { mine: null })).toEqual({});
  });
  it('the scopes are separate: the rail never moves the page', () => {
    expect(updateSaved(start, 'rail', { programs: ['md-phd'] }).page).toEqual(start.page);
    expect(clearScope(start, 'page')).toEqual({ rail: { programs: ['do'] } });
  });
});
