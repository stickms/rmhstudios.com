import { describe, expect, it } from 'vitest';
import schools from '../../../data/medschools/schools.json';
import { programLinksOf } from './program-links.server';

describe('programLinksOf', () => {
  it('returns the admissions and MD-PhD pages for a school that has both', () => {
    const l = programLinksOf('alabama');
    expect(l.admissionsUrl).toMatch(/^https:\/\//);
    expect(l.mdphdUrl).toBe('https://www.uab.edu/medicine/home/mstp/curriculum');
  });

  it('adds the MD-PhD page of a school the program file lacks', () => {
    expect(programLinksOf('suny-upstate').mdphdUrl).toBe('https://www.upstate.edu/mdphd/');
  });

  it('is null, not undefined, for a school with nothing read', () => {
    expect(programLinksOf('no-such-school')).toEqual({ websiteUrl: null, admissionsUrl: null, mdphdUrl: null });
  });

  it('every link is https and the registry has some of each', () => {
    const all = schools.schools.map((s) => programLinksOf(s.slug));
    for (const l of all) {
      for (const u of [l.admissionsUrl, l.mdphdUrl]) if (u) expect(u.startsWith('https://')).toBe(true);
    }
    expect(all.filter((l) => l.admissionsUrl).length).toBeGreaterThan(100);
    expect(all.filter((l) => l.mdphdUrl).length).toBeGreaterThan(100);
    // Every school has a homepage, from the registry's own or `program-sites.json`.
    const bare = schools.schools.filter((s) => !s.website && !programLinksOf(s.slug).websiteUrl).map((s) => s.slug);
    expect(bare).toEqual([]);
    for (const l of all) if (l.websiteUrl) expect(l.websiteUrl.startsWith('https://')).toBe(true);
  });
});
