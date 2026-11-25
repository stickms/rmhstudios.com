import { describe, expect, it } from 'vitest';
import { selectCandidates, type CandidateFilters } from './candidates';
import { SCHOOLS, cls, school, stat } from './fixtures';

const f = (over: Partial<CandidateFilters> = {}): CandidateFilters => ({
  states: [],
  degree: null,
  mdphd: false,
  size: null,
  missions: [],
  ...over,
});
const slugs = (r: ReturnType<typeof selectCandidates>) => r.candidates.map((c) => c.school.slug);

describe('selectCandidates', () => {
  it('filters by degree and state; schools with published figures come first, then by name', () => {
    expect(slugs(selectCandidates(SCHOOLS, f()))).toEqual(['alpha', 'bravo', 'charlie', 'echo', 'delta']);
    expect(slugs(selectCandidates(SCHOOLS, f({ degree: 'DO' })))).toEqual(['echo']);
    expect(slugs(selectCandidates(SCHOOLS, f({ states: ['MA', 'NJ'] })))).toEqual(['bravo', 'delta']);
  });

  it('MD-PhD keeps only schools with a program; research ranks them first and is the only mission with data', () => {
    expect(slugs(selectCandidates(SCHOOLS, f({ mdphd: true })))).toEqual(['alpha']);
    const r = selectCandidates([...SCHOOLS].reverse(), f({ missions: ['research', 'rural'] }));
    expect(slugs(r)[0]).toBe('alpha');
    expect(r.unused).toEqual(['rural']);
  });

  it('size uses the published class size; a school without one is left out of a size filter', () => {
    expect(slugs(selectCandidates(SCHOOLS, f({ size: 'small' })))).toEqual(['alpha']);
    expect(slugs(selectCandidates(SCHOOLS, f({ size: 'medium' })))).toEqual(['bravo']);
    expect(slugs(selectCandidates(SCHOOLS, f({ size: 'large' })))).toEqual([]);
  });

  it('caps the candidates', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      school(`s${String(i).padStart(2, '0')}`, { classes: [cls([stat('MCAT_MEAN', '510', 510)])] }),
    );
    expect(selectCandidates(many, f())).toMatchObject({ candidates: expect.any(Array) });
    expect(selectCandidates(many, f()).candidates).toHaveLength(40);
    expect(selectCandidates(many, f(), 10).candidates).toHaveLength(10);
  });
});
