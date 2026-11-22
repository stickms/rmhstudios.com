import { describe, expect, it } from 'vitest';
import type { RegistrySchool } from '../../registry';
import { matchAdmitSchools, normalizeName } from './match-schools';
import type { AdmitSchoolRef } from './types';

const reg = (key: string, name: string, state: string): RegistrySchool => ({
  slug: key.toLowerCase(),
  name,
  shortName: key,
  degree: 'MD',
  city: 'X',
  state,
  country: 'US',
  website: null,
  aliases: [
    {
      source: 'CYCLETRACK',
      sourceKey: key,
    },
  ],
});
const adm = (slug: string, name: string, shortName: string, state: string): AdmitSchoolRef => ({
  slug,
  name,
  shortName,
  city: 'X',
  state,
  avgDifficulty: null,
  interviewCount: 0,
  totalInterviewCount: 0,
});

const registry = [
  reg('Yale', 'Yale School of Medicine', 'CT'),
  reg('Texas A&M', 'Texas A&M University', 'TX'),
  reg('UT Austin', 'The University of Texas at Austin Dell Medical School', 'TX'),
  reg('Dupe A', 'Same Name College', 'OH'),
  reg('Dupe B', 'Same Name College', 'OH'),
];

describe('normalizeName', () => {
  it('lowercases, maps & to and, strips punctuation and the/of/at', () => {
    expect(normalizeName('The University of Texas at Austin, A&M')).toBe('university texas austin a and m');
  });
});

describe('matchAdmitSchools', () => {
  it('exact name in the same state matches', () => {
    const r = matchAdmitSchools({
      admit: [adm('yale-som', 'Yale School of Medicine', 'Yale', 'CT')],
      registry,
      overrides: {},
    });
    expect(r.matched).toEqual([
      {
        cycletrackKey: 'Yale',
        admitSlug: 'yale-som',
      },
    ]);
  });

  it('matches by Admit shortName against the registry shortName', () => {
    const r = matchAdmitSchools({
      admit: [adm('x', 'Texas A and M College of Medicine', 'Texas A&M', 'TX')],
      registry,
      overrides: {},
    });
    expect(r.matched).toEqual([
      {
        cycletrackKey: 'Texas A&M',
        admitSlug: 'x',
      },
    ]);
  });

  it('two same-state candidates go to review', () => {
    const r = matchAdmitSchools({
      admit: [adm('dupe', 'Same Name College', 'Same', 'OH')],
      registry,
      overrides: {},
    });
    expect(r).toEqual({
      matched: [],
      review: ['dupe'],
      excluded: [],
    });
  });

  it('a name in another state is not a match', () => {
    const r = matchAdmitSchools({
      admit: [adm('yale-tx', 'Yale School of Medicine', 'Yale', 'TX')],
      registry,
      overrides: {},
    });
    expect(r.review).toEqual(['yale-tx']);
  });

  it('override null excludes, override string forces the match', () => {
    const r = matchAdmitSchools({
      admit: [adm('a', 'Anything', 'Any', 'TX'), adm('b', 'Other', 'Oth', 'TX')],
      registry,
      overrides: {
        a: null,
        b: 'UT Austin',
      },
    });
    expect(r).toEqual({
      matched: [
        {
          cycletrackKey: 'UT Austin',
          admitSlug: 'b',
        },
      ],
      review: [],
      excluded: ['a'],
    });
  });

  it('a Canadian slug is never matched', () => {
    const r = matchAdmitSchools({
      admit: [adm('mcgill', 'Yale School of Medicine', 'Yale', 'ON')],
      registry,
      overrides: {},
    });
    expect(r.matched).toEqual([]);
    expect(r.review).toEqual(['mcgill']);
    const ex = matchAdmitSchools({
      admit: [adm('mcgill', 'McGill', 'McGill', 'ON')],
      registry,
      overrides: {
        mcgill: null,
      },
    });
    expect(ex.excluded).toEqual(['mcgill']);
  });

  it('two Admit slugs matching one registry school both go to review', () => {
    const r = matchAdmitSchools({
      admit: [
        adm('yale-1', 'Yale School of Medicine', 'Yale', 'CT'),
        adm('yale-2', 'Yale School of Medicine', 'Yale', 'CT'),
      ],
      registry,
      overrides: {},
    });
    expect(r.matched).toEqual([]);
    expect(r.review.sort()).toEqual(['yale-1', 'yale-2']);
  });
});
