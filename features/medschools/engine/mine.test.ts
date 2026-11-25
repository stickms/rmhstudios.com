import { describe, expect, it } from 'vitest';
import {
  MAX_SCHOOLS_FILTER,
  decodeMine,
  encodeMine,
  mineOfSearch,
  mineSlugs,
  mineToSearch,
  schoolsParam,
  slugsOf,
} from './mine';
import { parseIndexSearch, parseLiveSearch } from './search';

const tracker = (slugs: string[] | null) => ({
  cycle: slugs ? { applications: slugs.map((slug) => ({ school: { slug } })) } : null,
});
const lists = {
  lists: [
    { id: 'reach', items: [{ school: { slug: 'duke' } }, { school: { slug: 'harvard' } }] },
    { id: 'safety', items: [{ school: { slug: 'wake' } }, { school: { slug: 'duke' } }] },
    { id: 'empty', items: [] },
  ],
};

describe('the URL and the stored form', () => {
  it('reads mine=cycle and list=all|<id> on the index and the live page', () => {
    expect(mineOfSearch(parseIndexSearch({ mine: 'cycle' }))).toEqual({ kind: 'cycle' });
    expect(mineOfSearch(parseLiveSearch({ mine: 'CYCLE' }))).toEqual({ kind: 'cycle' });
    expect(mineOfSearch(parseIndexSearch({ list: 'all' }))).toEqual({ kind: 'lists' });
    expect(mineOfSearch(parseLiveSearch({ list: 'cabc123' }))).toEqual({ kind: 'list', id: 'cabc123' });
    expect(mineOfSearch(parseIndexSearch({ list: 'Bad Id!', mine: 'other' }))).toBeUndefined();
    // A hand-written link with both: the cycle wins.
    expect(mineOfSearch(parseIndexSearch({ mine: 'cycle', list: 'all' }))).toEqual({ kind: 'cycle' });
  });
  it('writes both keys so the other is cleared', () => {
    expect(mineToSearch({ kind: 'cycle' })).toEqual({ mine: 'cycle', list: undefined });
    expect(mineToSearch({ kind: 'lists' })).toEqual({ mine: undefined, list: 'all' });
    expect(mineToSearch({ kind: 'list', id: 'x1' })).toEqual({ mine: undefined, list: 'x1' });
    expect(mineToSearch(null)).toEqual({ mine: undefined, list: undefined });
  });
  it('encodes for the select and the device store, and decodes junk as "All schools"', () => {
    for (const c of [{ kind: 'cycle' }, { kind: 'lists' }, { kind: 'list', id: 'abc' }] as const)
      expect(decodeMine(encodeMine(c))).toEqual(c);
    expect(encodeMine(null)).toBe('');
    for (const junk of ['', 'list:', 'list:A B', 'all', 7, null]) expect(decodeMine(junk)).toBeNull();
  });
});

describe('mineSlugs: the client filter', () => {
  it('My cycle is the newest cycle; an empty cycle or no cycle is an empty set', () => {
    expect([...mineSlugs({ kind: 'cycle' }, tracker(['duke', 'unc']), undefined)!]).toEqual(['duke', 'unc']);
    expect(mineSlugs({ kind: 'cycle' }, tracker(null), undefined)!.size).toBe(0);
  });
  it('All my lists is every list once; one list is its own schools', () => {
    expect([...mineSlugs({ kind: 'lists' }, undefined, lists)!].sort()).toEqual(['duke', 'harvard', 'wake']);
    expect([...mineSlugs({ kind: 'list', id: 'safety' }, undefined, lists)!]).toEqual(['wake', 'duke']);
    expect(mineSlugs({ kind: 'list', id: 'empty' }, undefined, lists)!.size).toBe(0);
  });
  it('no filter while the private answer is missing, for no choice, and for a list that is gone', () => {
    expect(mineSlugs({ kind: 'cycle' }, undefined, lists)).toBeNull();
    expect(mineSlugs({ kind: 'lists' }, tracker(['duke']), undefined)).toBeNull();
    expect(mineSlugs({ kind: 'list', id: 'deleted' }, undefined, lists)).toBeNull();
    expect(mineSlugs(null, tracker(['duke']), lists)).toBeNull();
  });
});

describe('schoolsParam: the public, user-independent schools= value', () => {
  it('is sorted and deduped, so one set is one cache key however the lists are ordered', () => {
    expect(schoolsParam(['wake', 'duke', 'harvard', 'duke'])).toBe('duke,harvard,wake');
    expect(schoolsParam(new Set(['harvard', 'duke']))).toBe(schoolsParam(['duke', 'harvard']));
  });
  it('drops malformed slugs, is undefined for an empty set and stops at the cap', () => {
    expect(schoolsParam(['Duke', 'a,b', ''])).toBeUndefined();
    expect(schoolsParam([])).toBeUndefined();
    const many = Array.from({ length: MAX_SCHOOLS_FILTER + 20 }, (_, i) => `s${String(i).padStart(3, '0')}`);
    expect(schoolsParam(many)!.split(',')).toHaveLength(MAX_SCHOOLS_FILTER);
  });
  it('the reader dedupes and sorts what anyone typed', () => {
    expect(slugsOf('wake,duke,wake')).toEqual(['duke', 'wake']);
  });
});
