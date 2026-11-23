import { describe, expect, it } from 'vitest';
import { askBody } from '../../api/qa-schemas';
import { clampCycle, filterSchools, parseRoute, resolveSchools, type SchoolDirEntry } from './route';

const OTHER = { intent: 'other', schools: [], cycle: null, filters: { state: null, format: null } };
const good = { intent: 'facts', schools: ['Duke'], cycle: 2027, filters: { state: 'TX', format: 'MMI' } };

describe('parseRoute', () => {
  it('round-trips a valid route', () => {
    expect(parseRoute(good)).toEqual(good);
    expect(
      parseRoute({ intent: 'timing', schools: [], cycle: null, filters: { state: null, format: null } }).intent,
    ).toBe('timing');
  });
  it('turns junk into other and never throws', () => {
    for (const junk of [null, 'prose', [], 5, undefined, {}, { intent: 'weather' }, { intent: 'facts' }.intent]) {
      expect(parseRoute(junk)).toEqual(OTHER);
    }
    expect(parseRoute({ intent: 'facts' })).toEqual({ ...OTHER, intent: 'facts' });
  });
  it('cuts 40 schools to 3 and each name to 80 characters', () => {
    const r = parseRoute({
      intent: 'compare',
      schools: Array.from({ length: 40 }, (_, i) => `School ${i}`.padEnd(200, 'x')),
    });
    expect(r.schools).toHaveLength(3);
    expect(r.schools.every((s) => s.length <= 80)).toBe(true);
    expect(parseRoute({ intent: 'facts', schools: [1, null, '  ', ' Duke '] }).schools).toEqual(['Duke']);
  });
  it('accepts only an integer cycle in range', () => {
    for (const c of [1999, '2027', 2027.5, null, 2101, NaN]) expect(parseRoute({ ...good, cycle: c }).cycle).toBeNull();
    expect(parseRoute({ ...good, cycle: 2026 }).cycle).toBe(2026);
  });
  it('accepts only a two-letter upper-case state and a known format', () => {
    expect(parseRoute({ ...good, filters: { state: 'Texas', format: 'MMI' } }).filters.state).toBeNull();
    expect(parseRoute({ ...good, filters: { state: 'tx', format: 'MMI' } }).filters.state).toBeNull();
    expect(parseRoute({ ...good, filters: { state: 'TX', format: 'speed dating' } }).filters.format).toBeNull();
    expect(parseRoute({ ...good, filters: 'x' }).filters).toEqual({ state: null, format: null });
  });
});

const dir: SchoolDirEntry[] = [
  { slug: 'duke', name: 'Duke University School of Medicine', shortName: 'Duke', state: 'NC', interviewFormat: 'MMI' },
  {
    slug: 'wayne-state',
    name: 'Wayne State University School of Medicine',
    shortName: 'Wayne',
    state: 'MI',
    interviewFormat: null,
  },
  {
    slug: 'wayne-do',
    name: 'Wayne College of Osteopathic Medicine',
    shortName: 'Wayne',
    state: 'OH',
    interviewFormat: null,
  },
  {
    slug: 'ut-houston',
    name: 'McGovern Medical School at UTHealth Houston',
    shortName: 'UT Houston',
    state: 'TX',
    interviewFormat: 'MMI',
  },
  { slug: 'baylor', name: 'Baylor College of Medicine', shortName: 'Baylor', state: 'TX', interviewFormat: 'MMI' },
  {
    slug: 'ut-southwestern',
    name: 'UT Southwestern Medical School',
    shortName: 'UTSW',
    state: 'TX',
    interviewFormat: 'traditional',
  },
];

describe('resolveSchools', () => {
  it('resolves names, short names, slugs and the name without its suffix, in any case', () => {
    for (const n of ['Duke', 'duke university', 'DUKE', 'Duke University School of Medicine', 'the duke']) {
      expect(resolveSchools([n], dir).slugs, n).toEqual(['duke']);
    }
    expect(resolveSchools(['Baylor', 'UTSW'], dir).slugs).toEqual(['baylor', 'ut-southwestern']);
  });
  it('leaves an ambiguous short name unresolved', () => {
    expect(resolveSchools(['Wayne'], dir)).toEqual({ slugs: [], unresolved: ['Wayne'] });
  });
  it('puts a pinned active slug first, deduped', () => {
    expect(resolveSchools(['Baylor', 'Duke'], dir, 'duke').slugs).toEqual(['duke', 'baylor']);
    expect(resolveSchools([], dir, 'duke').slugs).toEqual(['duke']);
    expect(resolveSchools([], dir, 'closed-school').slugs).toEqual([]);
  });
  it('returns at most 3 and reports unknown and inactive names', () => {
    const r = resolveSchools(['Duke', 'Baylor', 'UTSW', 'UT Houston', 'Hogwarts'], dir);
    expect(r.slugs).toHaveLength(3);
    expect(resolveSchools(['Hogwarts'], dir).unresolved).toEqual(['Hogwarts']);
  });
});

describe('filterSchools', () => {
  it('returns up to 5 matches, stable by name', () => {
    expect(filterSchools({ state: 'TX', format: 'MMI' }, dir, 5)).toEqual(['baylor', 'ut-houston']);
    expect(filterSchools({ state: 'TX', format: null }, dir, 2)).toEqual(['baylor', 'ut-houston']);
    expect(filterSchools({ state: null, format: 'mmi' }, dir, 5)).toEqual(['baylor', 'duke', 'ut-houston']);
  });
  it('returns none when both are null', () => {
    expect(filterSchools({ state: null, format: null }, dir, 5)).toEqual([]);
  });
});

describe('clampCycle', () => {
  it('uses the site cycle for null or far-off cycles', () => {
    expect(clampCycle(null, 2027)).toBe(2027);
    expect(clampCycle(2031, 2027)).toBe(2031);
    expect(clampCycle(2032, 2027)).toBe(2027);
    expect(clampCycle(2022, 2027)).toBe(2027);
    expect(clampCycle(2023, 2027)).toBe(2023);
  });
});

describe('askBody', () => {
  it('bounds the question and the slug', () => {
    expect(askBody.safeParse({ question: 'ab' }).success).toBe(false);
    expect(askBody.safeParse({ question: 'x'.repeat(401) }).success).toBe(false);
    expect(askBody.safeParse({ question: '   \n  ' }).success).toBe(false);
    expect(askBody.safeParse({ question: 'hello\u0000world' }).success).toBe(false);
    expect(askBody.safeParse({ question: 'Duke MCAT?', slug: 'Bad Slug' }).success).toBe(false);
    expect(askBody.safeParse({ question: 'abc' }).success).toBe(true);
    const p = askBody.parse({ question: '  What is the median?  ', slug: 'duke', extra: 1 });
    expect(p).toEqual({ question: 'What is the median?', slug: 'duke' });
  });
});
