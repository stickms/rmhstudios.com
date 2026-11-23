import { describe, expect, it } from 'vitest';
import {
  isAllPrograms,
  legacyOf,
  parsePrograms,
  programsFromLegacy,
  programsMatch,
  programsQueryValue,
  programsValue,
  schoolProgramOf,
  toggleProgramKey,
} from './programs';

describe('program set', () => {
  it('parses a comma list in any case and order into canonical order', () => {
    expect(parsePrograms('DO-PhD, md')).toEqual(['md', 'do-phd']);
    expect(parsePrograms(['do', 'md-phd'])).toEqual(['md-phd', 'do']);
    expect(parsePrograms('all')).toEqual(['md', 'md-phd', 'do', 'do-phd']);
  });

  it('is silent on empty or unknown input and drops unknown words among known ones', () => {
    expect(parsePrograms('')).toBeUndefined();
    expect(parsePrograms(undefined)).toBeUndefined();
    expect(parsePrograms('pa,np')).toBeUndefined();
    expect(parsePrograms('md,pa')).toEqual(['md']);
    expect(parsePrograms(7)).toBeUndefined();
  });

  it('writes the API value only when it filters, in canonical order', () => {
    expect(programsQueryValue(['md', 'md-phd', 'do', 'do-phd'])).toBeUndefined();
    expect(programsQueryValue(['do-phd', 'md'])).toBe('md,do-phd');
    expect(programsValue(['do', 'md'])).toBe('md,do');
  });

  it('maps the old degree and program parameters', () => {
    expect(programsFromLegacy('MD', 'ALL')).toEqual(['md', 'md-phd']);
    expect(programsFromLegacy('DO', 'PHD')).toEqual(['do-phd']);
    expect(programsFromLegacy(undefined, 'REG')).toEqual(['md', 'do']);
    expect(isAllPrograms(programsFromLegacy(undefined, 'ALL'))).toBe(true);
    expect(isAllPrograms(programsFromLegacy(undefined, undefined))).toBe(true);
  });

  it('keeps at least one program on', () => {
    expect(toggleProgramKey(['md'], 'md')).toEqual(['md']);
    expect(toggleProgramKey(['md'], 'do')).toEqual(['md', 'do']);
    expect(toggleProgramKey(['md', 'do'], 'md')).toEqual(['do']);
  });

  it('matches by degree and program; an unreported program belongs to the unfiltered set only', () => {
    expect(programsMatch(['md'], 'MD', 'REG')).toBe(true);
    expect(programsMatch(['md'], 'MD', 'PHD')).toBe(false);
    expect(programsMatch(['md'], 'DO', 'REG')).toBe(false);
    expect(programsMatch(['md'], 'MD', null)).toBe(false);
    expect(programsMatch(['md', 'md-phd', 'do', 'do-phd'], 'DO', null)).toBe(true);
  });

  it('reads a school page program from the set through the school degree', () => {
    expect(schoolProgramOf(['md-phd', 'do'], 'MD')).toBe('PHD');
    expect(schoolProgramOf(['md-phd', 'do'], 'DO')).toBe('REG');
    expect(schoolProgramOf(['do'], 'MD')).toBe('ALL');
    expect(schoolProgramOf(['md', 'md-phd'], 'MD')).toBe('ALL');
  });

  it('derives the legacy columns', () => {
    expect(legacyOf(['md-phd', 'do-phd'])).toEqual({ programFilter: 'PHD', degree: null });
    expect(legacyOf(['md'])).toEqual({ programFilter: 'REG', degree: 'MD' });
    expect(legacyOf(['md', 'md-phd'])).toEqual({ programFilter: 'ALL', degree: 'MD' });
    expect(legacyOf(['md', 'do-phd'])).toEqual({ programFilter: 'ALL', degree: null });
  });
});
