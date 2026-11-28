import { describe, expect, it } from 'vitest';
import { schoolsParam } from '../engine/mine';
import { parseLiveSearch } from '../engine/search';
import { listSchoolsQuery, liveQuery, liveSummaryQuery } from './read-schemas';

describe('the state filter on the public reads (owner 2026-11-24: several at once)', () => {
  it('takes one or several known codes, comma separated', () => {
    for (const schema of [listSchoolsQuery, liveQuery]) {
      expect(schema.safeParse({ state: 'NC' }).success).toBe(true);
      expect(schema.safeParse({ state: 'CA,NY,PR' }).success).toBe(true);
    }
  });
  it('refuses an unknown code, lower case, a malformed list and more than ten', () => {
    for (const schema of [listSchoolsQuery, liveQuery]) {
      for (const bad of ['ZZ', 'NC,ZZ', 'nc', 'NC,', 'NC;TX', 'AL,AK,AZ,AR,CA,CO,CT,DE,FL,GA,HI'])
        expect(schema.safeParse({ state: bad }).success, bad).toBe(false);
    }
  });
});

describe('the schools= filter on the live reads (owner 2026-11-24: My cycle, My lists)', () => {
  it('takes one to 300 slugs, comma separated, on the feed and the Today summary', () => {
    for (const schema of [liveQuery, liveSummaryQuery]) {
      expect(schema.safeParse({ schools: 'duke' }).success).toBe(true);
      expect(schema.safeParse({ schools: 'a-t-still-arizona,duke,wake-forest' }).success).toBe(true);
      const max = Array.from({ length: 300 }, (_, i) => 'school-' + i).join(',');
      expect(schema.safeParse({ schools: max }).success).toBe(true);
    }
  });
  it('accepts the same 80-character identifier in a school link and in a multi-school query', () => {
    const slug = 'a'.repeat(79) + '-';
    expect(parseLiveSearch({ school: slug }).school).toBe(slug);
    expect(liveQuery.parse({ school: slug })).toEqual({ school: slug });
    const schools = schoolsParam(['duke', slug]);
    expect(schools).toBe(slug + ',duke');
    expect(liveSummaryQuery.parse({ schools })).toEqual({ schools });
  });
  it('refuses an empty value, upper case, a malformed list, a long slug and more than 300', () => {
    const tooMany = Array.from({ length: 301 }, (_, i) => 's' + i).join(',');
    for (const schema of [liveQuery, liveSummaryQuery]) {
      for (const bad of ['', 'Duke', 'duke,', ',duke', 'duke;wake', 'duke wake', 'x'.repeat(81), tooMany])
        expect(schema.safeParse({ schools: bad }).success, bad.slice(0, 20)).toBe(false);
    }
  });
  it('is not a parameter of the school list (the index filters in the browser)', () => {
    expect(Object.keys(listSchoolsQuery.shape)).not.toContain('schools');
  });
});
