/** Fixture schools for the list builder's tests (FIXTURE figures, never real ones). */
import type { MedClassProfileDto, MedMdPhdDto } from '../../medschools.contract';
import type { PublicSchool } from './candidates';

type Stat = MedClassProfileDto['stats'][number];
export const stat = (kind: string, value: string, num: number | null, program: 'REG' | 'PHD' = 'REG'): Stat => ({
  kind: kind as Stat['kind'],
  program,
  value,
  num,
  qualifier: null,
  evidence: `${kind} ${value}`,
});

export const cls = (stats: Stat[], over: Partial<MedClassProfileDto> = {}): MedClassProfileDto => ({
  label: 'Entered 2026',
  enteringYear: 2026,
  url: 'https://med.example.edu/class-profile',
  checkedOn: '2026-11-24',
  stats,
  ...over,
});

export const mdphd = (mstp: boolean): MedMdPhdDto => ({
  program: {
    exists: true,
    name: 'MSTP',
    source: 'SCHOOL_PAGE',
    sourceUrl: 'https://med.example.edu/mdphd',
    checkedOn: '2026-11-24',
  },
  timeline: null,
  mstp: mstp
    ? {
        listed: true,
        grant: 'T32GM000001',
        fiscalYear: 2026,
        sourceUrl: 'https://reporter.nih.gov/x',
        checkedOn: '2026-11-24',
      }
    : null,
});

export const school = (slug: string, over: Partial<PublicSchool> = {}): PublicSchool => ({
  slug,
  name: `${slug[0]!.toUpperCase()}${slug.slice(1)} School of Medicine`,
  shortName: slug,
  state: 'NY',
  degree: 'MD',
  classes: [],
  mdphd: null,
  ...over,
});

/** Five schools: a high-figure research school, a mid one, a low one, one with no figures, a DO school in Texas. */
export const SCHOOLS: PublicSchool[] = [
  school('alpha', {
    state: 'NY',
    classes: [cls([stat('MCAT_MEDIAN', '520', 520), stat('GPA_MEDIAN', '3.90', 3.9), stat('MATRICULANTS', '110', 110)])],
    mdphd: mdphd(true),
  }),
  school('bravo', {
    state: 'MA',
    classes: [cls([stat('MCAT_MEAN', '512', 512), stat('GPA_MEAN', '3.75', 3.75), stat('MATRICULANTS', '160', 160)])],
  }),
  school('charlie', {
    state: 'PA',
    classes: [cls([stat('MCAT_MEAN', '506', 506), stat('GPA_MEAN', '3.60', 3.6), stat('IN_STATE_PCT', '70%', 70)])],
  }),
  school('delta', { state: 'NJ' }),
  school('echo', { state: 'TX', degree: 'DO', classes: [cls([stat('MCAT_MEAN', '504', 504)])] }),
];
